import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addToQueue,
  editQueueText,
  entryPreview,
  makeQueueEntry,
  promoteInQueue,
  queueLabel,
  removeFromQueue,
} from '../src/lib/queue-ops.mjs';

test('makeQueueEntry gives each entry a distinct stable id', () => {
  const a = makeQueueEntry('one');
  const b = makeQueueEntry('two');
  assert.notEqual(a.id, b.id);
  assert.equal(a.text, 'one');
  assert.equal('image' in a, false);
});

test('makeQueueEntry keeps an attached image', () => {
  const e = makeQueueEntry('look', 'data:image/png;base64,AAAA');
  assert.equal(e.image, 'data:image/png;base64,AAAA');
});

test('add then remove a specific queued entry by id', () => {
  const first = makeQueueEntry('first');
  const second = makeQueueEntry('second');
  let q = addToQueue(addToQueue([], first), second);
  assert.deepEqual(q.map(e => e.text), ['first', 'second']);
  q = removeFromQueue(q, first.id);
  assert.deepEqual(q.map(e => e.text), ['second']);
});

test('remove is a no-op for an unknown id', () => {
  const only = makeQueueEntry('only');
  const q = [only];
  assert.equal(removeFromQueue(q, 'missing'), q);
});

test('promote moves an entry to the front so it drains next', () => {
  const a = makeQueueEntry('a');
  const b = makeQueueEntry('b');
  const c = makeQueueEntry('c');
  const q = [a, b, c];
  assert.deepEqual(promoteInQueue(q, c.id).map(e => e.text), ['c', 'a', 'b']);
  assert.equal(promoteInQueue(q, a.id), q); // already head → unchanged
  assert.equal(promoteInQueue(q, 'nope'), q);
});

test('edit rewrites text and rejects a blank save', () => {
  const a = makeQueueEntry('old');
  const q = [a];
  assert.deepEqual(editQueueText(q, a.id, 'new').map(e => e.text), ['new']);
  assert.equal(editQueueText(q, a.id, '   '), q); // blank rejected
  assert.equal(editQueueText(q, a.id, 'old'), q); // unchanged text is a no-op
});

test('queueLabel shows only when work waits', () => {
  assert.equal(queueLabel(3), 'Đang chờ · 3 tin');
  assert.equal(queueLabel(0), '');
});

test('entryPreview falls back to image / empty markers', () => {
  assert.equal(entryPreview({ text: 'hi' }), 'hi');
  assert.equal(entryPreview({ text: '', image: 'data:...' }), '[Ảnh đính kèm]');
  assert.equal(entryPreview({ text: '   ' }), '(tin trống)');
});
