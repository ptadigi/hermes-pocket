import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeQueueForSession, mutateWithReconcile } from '../src/lib/shared-queue-client.mjs';

test('merges canonical text entries with local-only attachments in timestamp order', () => {
  const snapshot = { revision: 2, sessions: { a: [{ id: 's', text: 'shared', queuedAt: 20, source: 'desktop' }] } };
  const local = [{ id: 'l', text: 'image', image: 'data:...', queuedAt: 10 }];
  assert.deepEqual(mergeQueueForSession(snapshot, 'a', local).map(x => x.id), ['l', 's']);
});

test('drains only when canonical runtime authority confirms idle', async () => {
  const { canDrainSession } = await import('../src/lib/shared-queue-client.mjs');
  const idle = { available: true, sessions: [{ id: 'session-a', session_key: 'canonical-a', status: 'idle' }] };
  for (const status of ['starting', 'waiting', 'working']) {
    assert.equal(canDrainSession({ available: true, sessions: [{ id: 'session-a', session_key: 'canonical-a', status }] }, 'canonical-a', false), false);
  }
  assert.equal(canDrainSession(idle, 'canonical-a', false), true);
  assert.equal(canDrainSession(idle, 'session-a', false), true);
  assert.equal(canDrainSession(idle, 'canonical-a', true), false);
  assert.equal(canDrainSession({ available: false, sessions: [] }, 'canonical-a', false), false);
});

test('reconciles and retries once after revision conflict', async () => {
  const calls = [];
  const current = { revision: 4, sessions: {} };
  const accepted = { revision: 5, sessions: { a: [{ id: 'q', text: 'hello', queuedAt: 1, source: 'pocket' }] } };
  const api = { mutateQueue: async payload => {
    calls.push(payload.expectedRevision);
    if (calls.length === 1) { const error = new Error('conflict'); error.code = 'revision_conflict'; error.current = current; throw error; }
    return accepted;
  } };
  const revision = { current: 3 }, applied = [];
  const out = await mutateWithReconcile({ api, payload: { op: 'append', sessionId: 'a' }, revision, apply: value => applied.push(value.revision) });
  assert.equal(out.revision, 5);
  assert.deepEqual(calls, [3, 4]);
  assert.deepEqual(applied, [4, 5]);
});
