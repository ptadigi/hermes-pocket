import test from 'node:test';
import assert from 'node:assert/strict';
import { channelKey, parseChannel } from '../server/ws-hub.mjs';
import { createHub, activeSessions, subscribe, subscribersFor } from '../server/ws-hub.mjs';

test('channel keys bind a session to its owning profile', () => {
  assert.equal(channelKey('default', 's1'), 'default::s1');
  assert.equal(channelKey('culiai', 's1'), 'culiai::s1');
  assert.notEqual(channelKey('default', 's1'), channelKey('culiai', 's1'));
});

test('channel keys round-trip back to profile and session', () => {
  assert.deepEqual(parseChannel('culiai::s1'), { profile: 'culiai', sessionId: 's1' });
  assert.deepEqual(parseChannel('default::abc-DEF_9'), { profile: 'default', sessionId: 'abc-DEF_9' });
  assert.equal(parseChannel('no-separator'), null);
  assert.equal(parseChannel(''), null);
});

test('session ids containing the separator do not leak across profiles', () => {
  const key = channelKey('default', 's1::spoof');
  assert.deepEqual(parseChannel(key), { profile: 'default', sessionId: 's1::spoof' });
  assert.notEqual(key, channelKey('s1', 'spoof'));
});

test('the same session id in two profiles stays isolated in the hub', () => {
  const hub = createHub(), connA = {}, connB = {};
  subscribe(hub, connA, channelKey('default', 'shared-id'));
  subscribe(hub, connB, channelKey('culiai', 'shared-id'));
  assert.deepEqual(subscribersFor(hub, channelKey('default', 'shared-id')), [connA]);
  assert.deepEqual(subscribersFor(hub, channelKey('culiai', 'shared-id')), [connB]);
  assert.equal(activeSessions(hub).length, 2);
});
