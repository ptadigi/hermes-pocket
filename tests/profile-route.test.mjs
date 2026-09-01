import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createPocketServer } from '../server/app.mjs';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => server.close(resolve));
const loginCookie = async port => {
  const login = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }),
  });
  return login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
};

const makeUpstream = tag => {
  let seenAuth = '';
  const server = http.createServer((req, res) => {
    seenAuth = req.headers.authorization || '';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ tag }));
  });
  return { server, seen: () => seenAuth };
};

test('GET /pocket/profiles lists discovered profiles without secrets', async () => {
  const profiles = [
    { id: 'default', configured: true, base: 'http://127.0.0.1:8642', key: 'secret-default', port: 8642, sticky: true },
    { id: 'culiai', configured: true, base: 'http://127.0.0.1:8643', key: 'secret-culiai', port: 8643, sticky: false },
    { id: 'empty', configured: false, base: null, key: null, port: null, sticky: false },
  ];
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'secret-default',
    hermesBase: 'http://127.0.0.1:8642', staticDir: null, profileProvider: async () => profiles,
  });
  const port = await listen(app);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/profiles`)).status, 401);
    const cookie = await loginCookie(port);
    const res = await fetch(`http://127.0.0.1:${port}/pocket/profiles`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.profiles.map(p => p.id), ['default', 'culiai', 'empty']);
    assert.equal(body.profiles[0].configured, true);
    assert.equal(body.profiles[2].configured, false);
    assert.ok(!JSON.stringify(body).includes('secret-default'));
    assert.ok(!JSON.stringify(body).includes('secret-culiai'));
  } finally { await close(app); }
});

test('proxy routes to the profile named by X-Pocket-Profile with its own key', async () => {
  const a = makeUpstream('default'); const b = makeUpstream('culiai');
  const pa = await listen(a.server); const pb = await listen(b.server);
  const profiles = [
    { id: 'default', configured: true, base: `http://127.0.0.1:${pa}`, key: 'key-A', port: pa, sticky: true },
    { id: 'culiai', configured: true, base: `http://127.0.0.1:${pb}`, key: 'key-B', port: pb, sticky: false },
  ];
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key-A',
    hermesBase: `http://127.0.0.1:${pa}`, staticDir: null, profileProvider: async () => profiles,
  });
  const port = await listen(app);
  try {
    const cookie = await loginCookie(port);
    const toDefault = await (await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`, { headers: { cookie } })).json();
    assert.equal(toDefault.tag, 'default');
    assert.equal(a.seen(), 'Bearer key-A');
    const toCuliai = await (await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`, { headers: { cookie, 'x-pocket-profile': 'culiai' } })).json();
    assert.equal(toCuliai.tag, 'culiai');
    assert.equal(b.seen(), 'Bearer key-B');
  } finally { await close(app); await close(a.server); await close(b.server); }
});

test('proxy rejects an unknown or unconfigured profile with 404', async () => {
  const a = makeUpstream('default');
  const pa = await listen(a.server);
  const profiles = [
    { id: 'default', configured: true, base: `http://127.0.0.1:${pa}`, key: 'key-A', port: pa, sticky: true },
    { id: 'culiai', configured: false, base: null, key: null, port: null, sticky: false },
  ];
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key-A',
    hermesBase: `http://127.0.0.1:${pa}`, staticDir: null, profileProvider: async () => profiles,
  });
  const port = await listen(app);
  try {
    const cookie = await loginCookie(port);
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`, { headers: { cookie, 'x-pocket-profile': 'culiai' } })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`, { headers: { cookie, 'x-pocket-profile': 'ghost' } })).status, 404);
  } finally { await close(app); await close(a.server); }
});

test('without a profile provider the proxy uses the base upstream (backward compatible)', async () => {
  const a = makeUpstream('base');
  const pa = await listen(a.server);
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'legacy-key',
    hermesBase: `http://127.0.0.1:${pa}`, staticDir: null,
  });
  const port = await listen(app);
  try {
    const cookie = await loginCookie(port);
    const res = await (await fetch(`http://127.0.0.1:${port}/pocket/api/health/detailed`, { headers: { cookie } })).json();
    assert.equal(res.tag, 'base');
    assert.equal(a.seen(), 'Bearer legacy-key');
  } finally { await close(app); await close(a.server); }
});
