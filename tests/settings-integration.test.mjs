import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPocketServer } from '../server/app.mjs';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const close = server => new Promise(resolve => server.close(resolve));

async function login(port) {
  const response = await fetch(`http://127.0.0.1:${port}/pocket/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'owner-password' }),
  });
  const values = response.headers.getSetCookie();
  return {
    cookie: values.map(v => v.split(';')[0]).join('; '),
    csrf: decodeURIComponent(values.find(v => v.startsWith('hp_csrf='))?.split(';')[0].split('=')[1] || ''),
  };
}

function appWithRunner(runner) {
  return createPocketServer({
    authSecret: 'auth-secret-long-enough', password: 'owner-password', hermesKey: 'unused',
    hermesBase: 'http://127.0.0.1:1', staticDir: null, settingsRunner: runner,
  });
}

test('settings endpoints require Pocket authentication', async () => {
  const app = appWithRunner(async () => ({ ok: true }));
  const port = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/pocket/settings/config`);
    assert.equal(response.status, 401);
  } finally { await close(app); }
});

test('settings config/schema and redacted credential status come from authority runner', async () => {
  const calls = [];
  const app = appWithRunner(async request => {
    calls.push(request);
    if (request.action === 'config.get') return { config: { model: 'provider/model', compression: { threshold: 0.8 } } };
    if (request.action === 'config.schema') return { fields: { model: { type: 'string' } }, category_order: ['general'] };
    if (request.action === 'env.list') return { env: { OPENAI_API_KEY: { is_set: true, redacted_value: 'sk-…abcd' } } };
    throw new Error('unexpected');
  });
  const port = await listen(app);
  try {
    const auth = await login(port);
    const options = { headers: { cookie: auth.cookie } };
    const config = await (await fetch(`http://127.0.0.1:${port}/pocket/settings/config`, options)).json();
    const schema = await (await fetch(`http://127.0.0.1:${port}/pocket/settings/schema`, options)).json();
    const env = await (await fetch(`http://127.0.0.1:${port}/pocket/settings/env`, options)).json();
    assert.equal(config.config.compression.threshold, 0.8);
    assert.equal(schema.fields.model.type, 'string');
    assert.deepEqual(env.env.OPENAI_API_KEY, { is_set: true, redacted_value: 'sk-…abcd' });
    assert.deepEqual(calls.map(x => x.action), ['config.get', 'config.schema', 'env.list']);
    assert.equal(JSON.stringify(env).includes('secret-value'), false);
  } finally { await close(app); }
});

test('settings mutations require csrf and pass only the intended action', async () => {
  const calls = [];
  const app = appWithRunner(async request => { calls.push(request); return { ok: true }; });
  const port = await listen(app);
  try {
    const auth = await login(port);
    const denied = await fetch(`http://127.0.0.1:${port}/pocket/settings/config`, {
      method: 'PUT', headers: { cookie: auth.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ config: { model: 'x/y' } }),
    });
    assert.equal(denied.status, 403);
    const saved = await fetch(`http://127.0.0.1:${port}/pocket/settings/config`, {
      method: 'PUT', headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ config: { model: 'x/y' } }),
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(calls, [{ action: 'config.save', config: { model: 'x/y' } }]);
  } finally { await close(app); }
});

test('custom provider CRUD routes stay authenticated, csrf-bound and narrowly mapped', async () => {
  const calls = [];
  const app = appWithRunner(async request => { calls.push(request); return request.action === 'providers.custom.list' ? { endpoints: [] } : { ok: true }; });
  const port = await listen(app);
  try {
    const auth = await login(port), headers = { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' };
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/pocket/settings/providers/custom`, { headers: { cookie: auth.cookie } })).json(), { endpoints: [] });
    const endpoint = { name: 'Local', base_url: 'http://127.0.0.1:20128/v1', model: 'provider/model' };
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/settings/providers/custom`, { method: 'POST', headers, body: JSON.stringify({ endpoint }) })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/settings/providers/custom/local/activate`, { method: 'POST', headers, body: '{}' })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/pocket/settings/providers/custom/local`, { method: 'DELETE', headers, body: '{}' })).status, 200);
    assert.deepEqual(calls, [
      { action: 'providers.custom.list' }, { action: 'providers.custom.save', endpoint },
      { action: 'providers.custom.activate', id: 'local' }, { action: 'providers.custom.delete', id: 'local' },
    ]);
  } finally { await close(app); }
});

test('Pocket never exposes an env reveal endpoint', async () => {
  const app = appWithRunner(async () => ({ value: 'secret-value' }));
  const port = await listen(app);
  try {
    const auth = await login(port);
    const response = await fetch(`http://127.0.0.1:${port}/pocket/settings/env/reveal`, { headers: { cookie: auth.cookie } });
    assert.equal(response.status, 404);
  } finally { await close(app); }
});
