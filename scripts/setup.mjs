import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const example = resolve(root, '.env.example');
const target = resolve(root, '.env.local');

if (existsSync(target)) {
  console.log('.env.local already exists; no changes made.');
  process.exit(0);
}

copyFileSync(example, target);
const secret = randomBytes(48).toString('base64url');
const configured = readFileSync(target, 'utf8').replace(
  /^POCKET_AUTH_SECRET=.*$/m,
  `POCKET_AUTH_SECRET=${secret}`,
);
writeFileSync(target, configured, { encoding: 'utf8', mode: 0o600 });
console.log('Created .env.local with a generated POCKET_AUTH_SECRET.');
console.log('Next: set POCKET_PASSWORD and API_SERVER_KEY, then run npm run check.');
