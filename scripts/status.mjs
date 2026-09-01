import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env.local');
if (existsSync(envFile)) loadEnvFile(envFile);
const host = process.env.POCKET_HOST || '127.0.0.1';
const port = process.env.POCKET_PORT || '9999';
const url = process.env.POCKET_URL || `http://${host}:${port}/pocket/health`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const body = await response.json().catch(() => null);
  const healthy = response.ok && body?.service === 'hermes-pocket' && body?.status === 'ok';
  console.log(JSON.stringify({ reachable: healthy, status: response.status, service: body?.service || null }));
  process.exit(healthy ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ reachable: false, error: error.name }));
  process.exit(1);
}
