import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStatus, statusLabel } from '../src/lib/session-status.mjs';

const live = {
  available: true,
  sessions: [
    { id: 'r1', session_key: 'a', status: 'working' },
    { id: 'r2', session_key: 'b', status: 'idle' },
    { id: 'r3', session_key: 'c', status: 'waiting' },
  ],
};

test('status reflects authoritative running vs stopped sessions', () => {
  assert.equal(sessionStatus('a', live), 'running');
  assert.equal(sessionStatus('c', live), 'running');
  assert.equal(sessionStatus('b', live), 'stopped');
  assert.equal(sessionStatus('missing-from-snapshot', live), 'stopped');
});

test('a live local Pocket run is green immediately, without waiting for the snapshot', () => {
  assert.equal(sessionStatus('a', { available: false, sessions: [] }, true), 'running');
});

test('missing snapshot fails closed rather than showing a false green', () => {
  assert.equal(sessionStatus('a', { available: false, sessions: [] }), 'unavailable');
  assert.equal(sessionStatus('a', null), 'unavailable');
});

test('labels are explicit Vietnamese states', () => {
  assert.equal(statusLabel('running'), 'Đang chạy');
  assert.equal(statusLabel('stopped'), 'Đã dừng');
  assert.equal(statusLabel('unavailable'), 'Chưa rõ trạng thái');
});
