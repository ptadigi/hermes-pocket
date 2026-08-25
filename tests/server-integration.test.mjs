import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createPocketServer } from '../server/app.mjs';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => server.close(resolve));

test('login issues secure session; authenticated proxy hides bearer key', async () => {
  let upstreamAuth = '';
  const upstream = http.createServer((req, res) => {
    upstreamAuth = req.headers.authorization || '';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
  });
  const upstreamPort = await listen(upstream);
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'hermes-secret',
    hermesBase: `http://127.0.0.1:${upstreamPort}`, staticDir: null,
  });
  const port = await listen(app);
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`);
    assert.equal(denied.status, 401);
    const login = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }),
    });
    assert.equal(login.status, 200);
    const cookies = login.headers.getSetCookie();
    assert.ok(cookies.some(v => v.startsWith('hp_session=')));
    assert.ok(cookies.some(v => v.startsWith('hp_csrf=')));
    const cookie = cookies.map(v => v.split(';')[0]).join('; ');
    const proxied = await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`, { headers: { cookie } });
    assert.equal(proxied.status, 200);
    assert.equal(upstreamAuth, 'Bearer hermes-secret');
    assert.equal(proxied.headers.get('authorization'), null);
  } finally { await close(app); await close(upstream); }
});

test('mutating proxy rejects missing csrf', async () => {
  const upstream = http.createServer((_req, res) => res.end('{}'));
  const upstreamPort = await listen(upstream);
  const app = createPocketServer({ authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key', hermesBase: `http://127.0.0.1:${upstreamPort}`, staticDir: null });
  const port = await listen(app);
  try {
    const login = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }) });
    const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const response = await fetch(`http://127.0.0.1:${port}/pocket/api/api/sessions`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
  } finally { await close(app); await close(upstream); }
});
