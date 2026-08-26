import test from'node:test';import assert from'node:assert/strict';import{nextBackoffMs,shouldReconcile}from'../src/lib/ws-client.mjs';

test('reconnect backoff grows exponentially and caps at 8s',()=>{
  assert.equal(nextBackoffMs(0),500);
  assert.equal(nextBackoffMs(1),1000);
  assert.equal(nextBackoffMs(2),2000);
  assert.equal(nextBackoffMs(10),8000);
});

test('only a change frame for the currently active session triggers reconcile',()=>{
  assert.equal(shouldReconcile(JSON.stringify({type:'session.changed',sessionId:'a'}),'a'),true);
  assert.equal(shouldReconcile(JSON.stringify({type:'session.changed',sessionId:'b'}),'a'),false);
  assert.equal(shouldReconcile(JSON.stringify({type:'connected',sessionId:'a'}),'a'),false);
  assert.equal(shouldReconcile('not-json','a'),false);
});
