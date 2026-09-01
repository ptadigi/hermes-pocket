import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLoopbackHost } from '../server/host-policy.mjs';

test('accepts explicit loopback bind hosts', () => {
  for (const host of ['127.0.0.1', '::1', 'localhost']) assert.equal(requireLoopbackHost(host), host);
});

test('rejects wildcard and LAN bind hosts', () => {
  for (const host of ['0.0.0.0', '::', '192.168.1.20', '10.0.0.5']) {
    assert.throws(() => requireLoopbackHost(host), /POCKET_HOST must be loopback-only/);
  }
});

test('defaults an empty host to IPv4 loopback', () => {
  assert.equal(requireLoopbackHost(''), '127.0.0.1');
});
