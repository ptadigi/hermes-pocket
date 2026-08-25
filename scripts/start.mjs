import { spawn } from 'node:child_process';
import { readFileSync, openSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env };
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const at = line.indexOf('='); env[line.slice(0, at)] = line.slice(at + 1);
}
const log = openSync(resolve(root, 'hermes-pocket.log'), 'a');
const child = spawn(process.execPath, [resolve(root, 'server/index.mjs')], { cwd: root, env, detached: true, stdio: ['ignore', log, log], windowsHide: true });
child.unref();
console.log(child.pid);
