import test from'node:test';import assert from'node:assert/strict';
import{activeSessions,createHub,hasSubscribers,pollDecision,subscribe,subscribersFor,unsubscribe}from'../server/ws-hub.mjs';

test('a connection subscribes to exactly one canonical session at a time',()=>{
  const hub=createHub(),connA={},connB={};
  subscribe(hub,connA,'s1');subscribe(hub,connB,'s1');
  assert.deepEqual(new Set(subscribersFor(hub,'s1')),new Set([connA,connB]));
  subscribe(hub,connA,'s2');
  assert.deepEqual(subscribersFor(hub,'s1'),[connB]);
  assert.deepEqual(subscribersFor(hub,'s2'),[connA]);
  assert.deepEqual(new Set(activeSessions(hub)),new Set(['s1','s2']));
});

test('unsubscribe removes empty session buckets so idle sessions are not polled',()=>{
  const hub=createHub(),conn={};
  subscribe(hub,conn,'s1');
  assert.equal(hasSubscribers(hub,'s1'),true);
  unsubscribe(hub,conn);
  assert.equal(hasSubscribers(hub,'s1'),false);
  assert.deepEqual(activeSessions(hub),[]);
});

test('poll decision only fires on genuine new canonical activity, not identical re-fetch',()=>{
  const hub=createHub();
  assert.equal(pollDecision(hub,'s1',[{id:1},{id:2}]),true);
  assert.equal(pollDecision(hub,'s1',[{id:1},{id:2}]),false);
  assert.equal(pollDecision(hub,'s1',[{id:1},{id:2},{id:3}]),true);
});
