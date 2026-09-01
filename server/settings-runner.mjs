import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveHermesHome } from './profile-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'settings-authority.py');
const hermesHome = resolveHermesHome(process.env.HERMES_HOME || resolve(homedir(), 'AppData/Local/hermes'));
const defaultPython = resolve(hermesHome, 'hermes-agent/venv/Scripts/python.exe');

export function createSettingsRunner({ python = process.env.HERMES_PYTHON || defaultPython, timeoutMs = 20_000 } = {}) {
  return request => new Promise((resolvePromise, reject) => {
    const child = spawn(python, [script], {
      cwd: resolve(here, '..'),
      env: { ...process.env, PYTHONUTF8: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '', stderr = '', settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value); };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4_000_000) child.kill(); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 32_000) stderr = stderr.slice(-32_000); });
    child.on('error', error => finish(reject, error));
    child.on('close', code => {
      try {
        const line = stdout.trim().split(/\r?\n/).at(-1) || '{}';
        const parsed = JSON.parse(line);
        if (code || parsed.error) return finish(reject, new Error(parsed.message || `settings_authority_exit_${code}`));
        finish(resolvePromise, parsed);
      } catch { finish(reject, new Error('invalid_settings_authority_response')); }
    });
    child.stdin.end(JSON.stringify(request));
    const timer = setTimeout(() => { child.kill(); finish(reject, new Error('settings_authority_timeout')); }, timeoutMs);
  });
}
