import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_SECTIONS, fieldTitle, getPath, inputValue, setPath, visibleFields } from '../src/lib/settings-model.mjs';

test('Settings navigation preserves every Desktop menu group', () => {
  assert.deepEqual(SETTINGS_SECTIONS.map(x => x.id), ['model','chat','appearance','workspace','safety','memory','voice','advanced','notifications','billing','providers','gateway','keybinds','keys','plugins','sessions','about']);
});

test('nested config updates preserve sibling authority data', () => {
  const original = { compression: { threshold: 0.8, protect_last_n: 12 }, custom_providers: [{ api_key: 'keep' }] };
  const next = setPath(original, 'compression.threshold', 0.75);
  assert.equal(next.compression.threshold, 0.75);
  assert.equal(next.compression.protect_last_n, 12);
  assert.equal(next.custom_providers[0].api_key, 'keep');
  assert.equal(original.compression.threshold, 0.8);
  assert.equal(getPath(next, 'compression.threshold'), 0.75);
});

test('schema field conversion handles booleans, numbers and lists', () => {
  assert.equal(inputValue(false, 'boolean'), false);
  assert.equal(inputValue('42', 'number'), 42);
  assert.deepEqual(inputValue('web, terminal\nfile', 'list'), ['web','terminal','file']);
  assert.equal(fieldTitle('compression.threshold'), 'Compression Threshold');
  assert.deepEqual(visibleFields({ keys: ['a','b'] }, { fields: { b: {} } }), ['b']);
});

test('Model section includes canonical default model field', () => {
  assert.ok(SETTINGS_SECTIONS.find(x => x.id === 'model').keys.includes('model'));
});
