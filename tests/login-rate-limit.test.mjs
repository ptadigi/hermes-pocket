import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { createPocketServer } from '../server/app.mjs';

const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
const close = server => new Promise(resolve => server.close(resolve));
const login = (port, password, forwardedFor = '') => fetch(`http://127.0.0.1:${port}/pocket/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}) },
  body: JSON.stringify({ password }),
});

const createApp = () => createPocketServer({
  authSecret: 'auth-secret-long-enough',
  password: 'owner-password',
  hermesKey: 'key',
  staticDir: null,
});

test('login blocks the sixth wrong password from one client', async () => {
  const app = createApp();
  const port = await listen(app);
  try {
    for (let i = 0; i < 5; i += 1) assert.equal((await login(port, 'wrong', '203.0.113.10')).status, 401);
    const blocked = await login(port, 'wrong', '203.0.113.10');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  } finally { await close(app); }
});

test('slow concurrent wrong passwords cannot bypass the per-client throttle', async () => {
  const app = createApp();
  const port = await listen(app);
  try {
    const body = JSON.stringify({ password: 'wrong' });
    const sockets = [];
    const results = [];
    for (let i = 0; i < 12; i += 1) {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      await once(socket, 'connect');
      let response = '';
      socket.on('data', chunk => { response += chunk.toString(); });
      results.push(new Promise(resolve => socket.on('end', () => {
        resolve(Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1] || 0));
      })));
      socket.write([
        'POST /pocket/auth/login HTTP/1.1',
        'Host: localhost',
        'Content-Type: application/json',
        'X-Forwarded-For: 203.0.113.20',
        `Content-Length: ${Buffer.byteLength(body)}`,
        'Connection: close',
        '', '',
      ].join('\r\n'));
      sockets.push(socket);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const socket of sockets) socket.end(body);
    const statuses = await Promise.all(results);
    assert.ok(statuses.filter(status => status === 401).length <= 5, statuses.join(','));
    assert.ok(statuses.filter(status => status === 429).length >= 7, statuses.join(','));
  } finally { await close(app); }
});

test('a locked client cannot keep testing passwords during the cooldown', async () => {
  const app = createApp();
  const port = await listen(app);
  try {
    for (let i = 0; i < 5; i += 1) await login(port, 'wrong', '203.0.113.10');
    const blocked = await login(port, 'owner-password', '203.0.113.10');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  } finally { await close(app); }
});

test('trusted loopback proxy clients receive separate throttle buckets', async () => {
  const app = createApp();
  const port = await listen(app);
  try {
    for (let i = 0; i < 5; i += 1) await login(port, 'wrong', '203.0.113.10');
    assert.equal((await login(port, 'wrong', '203.0.113.10')).status, 429);
    assert.equal((await login(port, 'wrong', '203.0.113.11')).status, 401);
  } finally { await close(app); }
});
