import { spawn } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { configureFunnel } from './funnel-control.mjs';

const root = resolve(import.meta.dirname, '..');
loadEnvFile(resolve(root, '.env.local'));
const env = { ...process.env };
const host = env.POCKET_HOST || '127.0.0.1';
const port = env.POCKET_PORT || '9999';
const healthUrl = `http://${host}:${port}/pocket/health`;

const isHealthy = async () => {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.service === 'hermes-pocket' && body?.status === 'ok';
  } catch {
    return false;
  }
};

const waitForHealth = async (timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
  }
  return false;
};

const runCommand = (command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => {
    if (code === 0) return resolvePromise(stdout.trim());
    reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
  });
});

let pid = null;
if (await isHealthy()) {
  console.log(JSON.stringify({ status: 'already_running', health: healthUrl }));
} else {
  const log = openSync(resolve(root, 'hermes-pocket.log'), 'a');
  const child = spawn(process.execPath, [resolve(root, 'server/index.mjs')], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();
  pid = child.pid;
  if (!await waitForHealth()) {
    try { process.kill(pid); } catch {}
    throw new Error(`Hermes Pocket failed readiness check at ${healthUrl}; inspect hermes-pocket.log`);
  }
  console.log(JSON.stringify({ status: 'started', pid, health: healthUrl }));
}

// Public exposure is opt-in. Disabling revokes only Pocket's HTTPS port; it
// never resets unrelated Funnel mappings such as another service on 443.
const funnelPort = env.POCKET_FUNNEL_PORT || '8443';
const defaultWindowsBin = 'C:\\Program Files\\Tailscale\\tailscale.exe';
const tailscale = env.TAILSCALE_BIN || (process.platform === 'win32' && existsSync(defaultWindowsBin) ? defaultWindowsBin : 'tailscale');
const funnel = await configureFunnel({
  enabled: /^(?:1|true|yes)$/i.test(env.POCKET_ENABLE_FUNNEL || ''),
  httpsPort: funnelPort,
  targetPort: port,
  binary: tailscale,
  runner: runCommand,
});
console.log(JSON.stringify({ status: `funnel_${funnel.status}`, ...funnel }));
