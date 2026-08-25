import test from'node:test';import assert from'node:assert/strict';import{isNearBottom,streamSlice}from'../src/lib/scroll-ui.mjs';
test('near-bottom threshold controls jump visibility',()=>{assert.equal(isNearBottom(900,500,1450),true);assert.equal(isNearBottom(700,500,1450),false)});
test('stream slice drains bounded text',()=>{assert.deepEqual(streamSlice('abcdef',3),['abc','def'])});
