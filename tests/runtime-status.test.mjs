import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRuntimeSnapshot, sessionRuntimeState } from '../server/runtime-status.mjs';

const NOW = 2_000_000;

test('fresh default-profile snapshot preserves only safe session status fields', () => {
  const result = normalizeRuntimeSnapshot({
    generated_at: NOW - 1_000,
    profiles: {
      default: {
        sessions: [
          { id: 'runtime-a', session_key: 'stored-a', status: 'working', last_active: 123, token: 'must-not-leak' },
          { id: 'runtime-b', session_key: 'stored-b', status: 'idle' },
          { id: '', session_key: 'bad', status: 'working' },
          { id: 'runtime-c', session_key: 'stored-c', status: 'unknown' },
        ],
      },
    },
  }, NOW);

  assert.equal(result.available, true);
  assert.deepEqual(result.sessions, [
    { id: 'runtime-a', session_key: 'stored-a', status: 'working' },
    { id: 'runtime-b', session_key: 'stored-b', status: 'idle' },
  ]);
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('missing or stale snapshot fails closed instead of showing green', () => {
  assert.deepEqual(normalizeRuntimeSnapshot(null, NOW), { available: false, sessions: [] });
  assert.deepEqual(normalizeRuntimeSnapshot({ generated_at: NOW - 60_001, profiles: { default: { sessions: [] } } }, NOW), {
    available: false,
    sessions: [],
  });
});

test('session state is green only for authoritative running states', () => {
  const snapshot = normalizeRuntimeSnapshot({
    generated_at: NOW,
    profiles: { default: { sessions: [
      { id: 'r1', session_key: 'a', status: 'working' },
      { id: 'r2', session_key: 'b', status: 'waiting' },
      { id: 'r3', session_key: 'c', status: 'starting' },
      { id: 'r4', session_key: 'd', status: 'idle' },
    ] } },
  }, NOW);

  assert.equal(sessionRuntimeState('a', snapshot), 'running');
  assert.equal(sessionRuntimeState('b', snapshot), 'running');
  assert.equal(sessionRuntimeState('c', snapshot), 'running');
  assert.equal(sessionRuntimeState('d', snapshot), 'stopped');
  assert.equal(sessionRuntimeState('missing', snapshot), 'stopped');
  assert.equal(sessionRuntimeState('missing', { available: false, sessions: [] }), 'unavailable');
});
