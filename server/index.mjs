import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createPocketServer } from './app.mjs';
import { attachPocketRealtime } from './ws-transport.mjs';

const required = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const port = Number(process.env.POCKET_PORT || 9999);
const host = process.env.POCKET_HOST || '127.0.0.1';
const server = createPocketServer({
  authSecret: required('POCKET_AUTH_SECRET'),
  password: required('POCKET_PASSWORD'),
  hermesKey: required('API_SERVER_KEY'),
  hermesBase: process.env.HERMES_API_BASE || 'http://127.0.0.1:8642',
  staticDir: resolve('dist'),
});
attachPocketRealtime(server, {
  authSecret: required('POCKET_AUTH_SECRET'),
  hermesKey: required('API_SERVER_KEY'),
  hermesBase: process.env.HERMES_API_BASE || 'http://127.0.0.1:8642',
});
server.listen(port, host, () => console.log(`Hermes Pocket listening on http://${host}:${port}`));
