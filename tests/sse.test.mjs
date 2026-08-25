import test from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser } from '../src/lib/sse.mjs';

test('SSE parser handles split chunks and named Hermes events', () => {
  const events = [];
  const parser = createSseParser(event => events.push(event));
  parser.push('event: assistant.delta\ndata: {"delta":"Xin ');
  parser.push('chào"}\n\nevent: tool.started\ndata: {"tool_name":"web_search","run_id":"r1"}\n\n');
  parser.finish();
  assert.deepEqual(events, [
    { event: 'assistant.delta', data: { delta: 'Xin chào' } },
    { event: 'tool.started', data: { tool_name: 'web_search', run_id: 'r1' } },
  ]);
});

test('SSE parser preserves multiline data and ignores comments', () => {
  const events = [];
  const parser = createSseParser(event => events.push(event));
  parser.push(': heartbeat\nevent: message\ndata: line one\ndata: line two\n\n');
  parser.finish();
  assert.deepEqual(events, [{ event: 'message', data: 'line one\nline two' }]);
});
