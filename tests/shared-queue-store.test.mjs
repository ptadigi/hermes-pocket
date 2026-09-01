import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSharedQueueStore } from '../server/shared-queue-store.mjs';

const entry = (id, text, queuedAt = 100) => ({ id, text, queuedAt, source: 'pocket' });

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'hp-queue-'));
  try { await run(createSharedQueueStore(join(dir, 'queue.json'))); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('starts empty and appends text entries by canonical session', async () => fixture(async store => {
  assert.deepEqual(await store.read(), { revision: 0, sessions: {} });
  const out = await store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-1', 'hello') });
  assert.equal(out.revision, 1);
  assert.deepEqual(out.sessions['session-a'], [entry('q-1', 'hello')]);
}));

test('supports edit, promote, remove and compare-and-swap conflict', async () => fixture(async store => {
  await store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-1', 'first') });
  await store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-2', 'second', 101) });
  const edited = await store.mutate({ op: 'edit', sessionId: 'session-a', id: 'q-2', text: 'second edited', expectedRevision: 2 });
  assert.equal(edited.revision, 3);
  const promoted = await store.mutate({ op: 'promote', sessionId: 'session-a', id: 'q-2', expectedRevision: 3 });
  assert.deepEqual(promoted.sessions['session-a'].map(x => x.text), ['second edited', 'first']);
  await assert.rejects(() => store.mutate({ op: 'remove', sessionId: 'session-a', id: 'q-1', expectedRevision: 2 }), error => error?.code === 'revision_conflict');
  const removed = await store.mutate({ op: 'remove', sessionId: 'session-a', id: 'q-1', expectedRevision: 4 });
  assert.deepEqual(removed.sessions['session-a'].map(x => x.id), ['q-2']);
}));

test('rejects unsafe or oversized entries and preserves state', async () => fixture(async store => {
  await assert.rejects(() => store.mutate({ op: 'append', sessionId: '../bad', entry: entry('q-1', 'hello') }), /session/i);
  await assert.rejects(() => store.mutate({ op: 'append', sessionId: 'session-a', entry: { ...entry('q-1', 'x'.repeat(20_001)), secret: 'no' } }), /text/i);
  assert.deepEqual(await store.read(), { revision: 0, sessions: {} });
}));

test('serializes concurrent appends without dropping either entry', async () => fixture(async store => {
  await Promise.all([
    store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-1', 'one') }),
    store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-2', 'two', 101) })
  ]);
  const out = await store.read();
  assert.equal(out.revision, 2);
  assert.deepEqual(new Set(out.sessions['session-a'].map(x => x.id)), new Set(['q-1', 'q-2']));
}));

test('grants an entry lease to only one concurrent client', async () => fixture(async store => {
  await store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-1', 'send once') });
  const attempts = await Promise.allSettled([
    store.mutate({ op: 'claim', sessionId: 'session-a', id: 'q-1', owner: 'pocket-a', leaseMs: 30_000 }),
    store.mutate({ op: 'claim', sessionId: 'session-a', id: 'q-1', owner: 'desktop-a', leaseMs: 30_000 })
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(result => result.status === 'rejected' && result.reason?.code === 'queue_claimed').length, 1);
  const claimed = (await store.read()).sessions['session-a'][0];
  assert.ok(['pocket-a', 'desktop-a'].includes(claimed.claimedBy));
  assert.ok(claimed.claimUntil > Date.now());
}));

test('only the lease owner can remove a claimed entry, and release makes it claimable again', async () => fixture(async store => {
  await store.mutate({ op: 'append', sessionId: 'session-a', entry: entry('q-1', 'send once') });
  await store.mutate({ op: 'claim', sessionId: 'session-a', id: 'q-1', owner: 'pocket-a', leaseMs: 30_000 });
  await assert.rejects(() => store.mutate({ op: 'remove', sessionId: 'session-a', id: 'q-1', owner: 'desktop-a' }), error => error?.code === 'queue_claimed');
  await store.mutate({ op: 'release', sessionId: 'session-a', id: 'q-1', owner: 'pocket-a' });
  const reclaimed = await store.mutate({ op: 'claim', sessionId: 'session-a', id: 'q-1', owner: 'desktop-a', leaseMs: 30_000 });
  assert.equal(reclaimed.sessions['session-a'][0].claimedBy, 'desktop-a');
  const removed = await store.mutate({ op: 'remove', sessionId: 'session-a', id: 'q-1', owner: 'desktop-a' });
  assert.equal(removed.sessions['session-a'], undefined);
}));
