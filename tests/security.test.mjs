import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, verifySession, csrfMatches, validReturnPath } from '../server/security.mjs';

test('signed session round-trips and expires', () => {
  const now = 1_700_000_000_000;
  const token = issueSession('secret-that-is-long-enough', now, 'csrf-token');
  assert.deepEqual(verifySession(token, 'secret-that-is-long-enough', now + 1_000), { csrf: 'csrf-token' });
  assert.equal(verifySession(token, 'wrong-secret-that-is-long-enough', now + 1_000), null);
  assert.equal(verifySession(token, 'secret-that-is-long-enough', now + 86_400_001), null);
});

test('csrf requires exact signed-session/cookie/header match', () => {
  assert.equal(csrfMatches('abc', 'abc', 'abc'), true);
  assert.equal(csrfMatches('abc', 'ABC', 'ABC'), false);
  assert.equal(csrfMatches('abc', 'abc', 'ABC'), false);
  assert.equal(csrfMatches('', '', ''), false);
});

test('return path stays same-origin', () => {
  assert.equal(validReturnPath('/sessions?a=1'), '/sessions?a=1');
  assert.equal(validReturnPath('https://evil.example'), '/');
  assert.equal(validReturnPath('//evil.example'), '/');
});
