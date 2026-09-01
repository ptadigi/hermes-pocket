import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPocketServer } from '../server/app.mjs';
import { createSharedQueueStore } from '../server/shared-queue-store.mjs';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => server.close(resolve));

test('Pocket exposes a real unauthenticated health endpoint', async () => {
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key', staticDir: null,
  });
  const port = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/pocket/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'hermes-pocket' });
  } finally { await close(app); }
});

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

test('mutating proxy rejects a forged csrf cookie/header pair not bound to the signed session', async () => {
  let upstreamCalls = 0;
  const upstream = http.createServer((_req, res) => { upstreamCalls += 1; res.end('{}'); });
  const upstreamPort = await listen(upstream);
  const app = createPocketServer({ authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key', hermesBase: `http://127.0.0.1:${upstreamPort}`, staticDir: null });
  const port = await listen(app);
  try {
    const login = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }) });
    const sessionCookie = login.headers.getSetCookie().find(value => value.startsWith('hp_session=')).split(';')[0];
    const forgedCsrf = 'attacker-controlled-csrf';
    const response = await fetch(`http://127.0.0.1:${port}/pocket/api/api/sessions`, {
      method: 'POST',
      headers: { cookie: `${sessionCookie}; hp_csrf=${forgedCsrf}`, 'content-type': 'application/json', 'x-csrf-token': forgedCsrf },
      body: '{}',
    });
    assert.equal(response.status, 403);
    assert.equal(upstreamCalls, 0);
  } finally { await close(app); await close(upstream); }
});

test('runtime snapshot endpoint is authenticated, secret-free and fail-closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-pocket-runtime-'));
  const snapshot = join(dir, 'runtime-sessions.json');
  const upstream = http.createServer((_req, res) => res.end('{}'));
  const upstreamPort = await listen(upstream);
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key',
    hermesBase: `http://127.0.0.1:${upstreamPort}`, staticDir: null, runtimeSnapshotPath: snapshot,
  });
  const port = await listen(app);
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/pocket/runtime/sessions`);
    assert.equal(denied.status, 401);

    const login = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }),
    });
    const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');

    await writeFile(snapshot, JSON.stringify({
      generated_at: Date.now(),
      profiles: { default: { sessions: [
        { id: 'runtime-a', session_key: 'stored-a', status: 'working', token: 'must-not-leak' },
      ] } },
    }));
    const live = await fetch(`http://127.0.0.1:${port}/pocket/runtime/sessions`, { headers: { cookie } });
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), {
      available: true,
      sessions: [{ id: 'runtime-a', session_key: 'stored-a', status: 'working' }],
    });

    await writeFile(snapshot, '{broken-json');
    const broken = await fetch(`http://127.0.0.1:${port}/pocket/runtime/sessions`, { headers: { cookie } });
    assert.deepEqual(await broken.json(), { available: false, sessions: [] });
  } finally {
    await close(app); await close(upstream); await rm(dir, { recursive: true, force: true });
  }
});

test('shared queue endpoint requires auth/csrf and returns revision conflicts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hermes-pocket-queue-'));
  const store = createSharedQueueStore(join(dir, 'queue.json'));
  const upstream = http.createServer((_req, res) => res.end('{}'));
  const upstreamPort = await listen(upstream);
  const app = createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'key',
    hermesBase: `http://127.0.0.1:${upstreamPort}`, staticDir: null, sharedQueueStore: store,
  });
  const port = await listen(app);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/queue`)).status, 401);
    const login = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }),
    });
    const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
    const csrf = decodeURIComponent((cookie.match(/hp_csrf=([^;]+)/) || [])[1]);
    const mutation = { op: 'append', sessionId: 'session-a', expectedRevision: 0, entry: { id: 'q-1', text: 'hello', queuedAt: 100, source: 'pocket' } };
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/queue/mutate`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(mutation) })).status, 403);
    const accepted = await fetch(`http://127.0.0.1:${port}/pocket/queue/mutate`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(mutation) });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).revision, 1);
    const conflict = await fetch(`http://127.0.0.1:${port}/pocket/queue/mutate`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ ...mutation, entry: { ...mutation.entry, id: 'q-2' } }) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).current.revision, 1);
  } finally {
    await close(app); await close(upstream); await rm(dir, { recursive: true, force: true });
  }
});
