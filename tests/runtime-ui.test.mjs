import test from'node:test';import assert from'node:assert/strict';import{elapsedSeconds,queueLabel}from'../src/lib/runtime-ui.mjs';
test('stream timer counts whole running seconds',()=>{assert.equal(elapsedSeconds(1_000,6_499),5);assert.equal(elapsedSeconds(2_000,1_000),0)});
test('queue label is visible only when work waits',()=>{assert.equal(queueLabel(2),'Đang chờ · 2 tin');assert.equal(queueLabel(0),'')});
