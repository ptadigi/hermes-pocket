import test from 'node:test';
import assert from 'node:assert/strict';
import { configureFunnel } from '../scripts/funnel-control.mjs';

test('enable configures only the requested HTTPS port and local target', async () => {
  const calls = [];
  const result = await configureFunnel({ enabled: true, httpsPort: '8443', targetPort: '9999', binary: 'tailscale', runner: async (...args) => { calls.push(args); return 'ok'; } });
  assert.deepEqual(calls, [['tailscale', ['funnel', '--yes', '--bg', '--https=8443', '9999']]]);
  assert.deepEqual(result, { status: 'enabled', httpsPort: 8443, targetPort: 9999, output: 'ok' });
});

test('disabled startup leaves existing Funnel mappings untouched', async () => {
  const calls = [];
  const result = await configureFunnel({ enabled: false, httpsPort: '8443', targetPort: '9999', binary: 'tailscale', runner: async (...args) => { calls.push(args); return ''; } });
  assert.deepEqual(calls, []);
  assert.deepEqual(result, { status: 'unmanaged', httpsPort: 8443 });
});

test('explicit revoke disables only the requested HTTPS port', async () => {
  const calls = [];
  const result = await configureFunnel({ enabled: false, revoke: true, httpsPort: '8443', targetPort: '9999', binary: 'tailscale', runner: async (...args) => { calls.push(args); return ''; } });
  assert.deepEqual(calls, [['tailscale', ['funnel', '--yes', '--https=8443', 'off']]]);
  assert.deepEqual(result, { status: 'disabled', httpsPort: 8443 });
});

test('explicit revoke is idempotent when no handler or binary exists', async () => {
  for (const error of [Object.assign(new Error('handler does not exist'), { stderr: 'handler does not exist' }), Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })]) {
    assert.deepEqual(await configureFunnel({ enabled: false, revoke: true, httpsPort: '8443', targetPort: '9999', binary: 'tailscale', runner: async () => { throw error; } }), { status: 'already_disabled', httpsPort: 8443 });
  }
});

test('enable propagates Tailscale failures', async () => {
  await assert.rejects(() => configureFunnel({ enabled: true, httpsPort: '8443', targetPort: '9999', binary: 'tailscale', runner: async () => { throw new Error('not logged in'); } }), /not logged in/);
});
