import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedHermesRoute, isMutation } from '../server/proxy-policy.mjs';

test('only required Hermes routes are exposed', () => {
  assert.equal(allowedHermesRoute('GET', '/health/detailed'), true);
  assert.equal(allowedHermesRoute('GET', '/api/sessions?limit=20'), true);
  assert.equal(allowedHermesRoute('POST', '/api/sessions/abc/chat/stream'), true);
  assert.equal(allowedHermesRoute('POST', '/api/sessions/abc/model'), true);
  assert.equal(allowedHermesRoute('POST', '/v1/runs/run_1/approval'), true);
  assert.equal(allowedHermesRoute('DELETE', '/api/jobs/x'), false);
  assert.equal(allowedHermesRoute('GET', '/../../.env'), false);
});

test('mutations are identified for csrf enforcement', () => {
  assert.equal(isMutation('GET'), false);
  assert.equal(isMutation('POST'), true);
  assert.equal(isMutation('DELETE'), true);
});
