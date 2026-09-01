import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { configureFunnel } from './funnel-control.mjs';

const runCommand = (env, command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolvePromise(stdout.trim()) : reject(Object.assign(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`), { stderr })));
});

export async function uninstallStartup({ env = process.env, runner = null } = {}) {
  if (!env.APPDATA) throw new Error('APPDATA is required on Windows');
  const root = resolve(import.meta.dirname, '..');
  const envFile = env.POCKET_ENV_FILE || resolve(root, '.env.local');
  if (existsSync(envFile)) loadEnvFile(envFile);
  const merged = { ...process.env, ...env };
  const defaultWindowsBin = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  const tailscale = merged.TAILSCALE_BIN || (process.platform === 'win32' && existsSync(defaultWindowsBin) ? defaultWindowsBin : 'tailscale');
  const funnel = await configureFunnel({
    enabled: false,
    revoke: true,
    httpsPort: merged.POCKET_FUNNEL_PORT || '8443',
    targetPort: merged.POCKET_PORT || '9999',
    binary: tailscale,
    runner: runner || ((command, args) => runCommand(merged, command, args)),
  });
  const shortcut = resolve(merged.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup/Hermes-Pocket.cmd');
  if (!existsSync(shortcut)) return { status: 'not_installed', path: shortcut, funnel };
  unlinkSync(shortcut);
  return { status: 'uninstalled', path: shortcut, funnel };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await uninstallStartup()));
}
