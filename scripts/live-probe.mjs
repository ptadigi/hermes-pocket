import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const env = {};
for (const line of readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const at = line.indexOf('='); env[line.slice(0, at)] = line.slice(at + 1);
}
const base = env.HERMES_API_BASE;
const headers = { authorization: `Bearer ${env.API_SERVER_KEY}` };
for (const path of ['/health', '/v1/capabilities', '/api/sessions?limit=1']) {
  const response = await fetch(base + path, { headers, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.json();
  console.log(JSON.stringify({ path, status: response.status, object: body.object || body.status || 'ok' }));
}
