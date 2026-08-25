import test from 'node:test';import assert from 'node:assert/strict';import{canonicalProvider}from'../src/lib/model-route.mjs';
test('custom provider display name normalizes to runtime slug',()=>{assert.equal(canonicalProvider('custom:local-(127.0.0.1:20128)'),'custom');assert.equal(canonicalProvider('minimax'),'minimax');assert.equal(canonicalProvider(''),'')});
