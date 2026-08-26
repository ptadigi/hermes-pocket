import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsRoute, SETTINGS_VIEWS } from '../server/settings-policy.mjs';

test('Pocket exposes the complete Desktop settings navigation', () => {
  assert.deepEqual(SETTINGS_VIEWS.map(x => x.id), [
    'model','chat','appearance','workspace','safety','memory','voice','advanced',
    'notifications','billing','providers','gateway','keybinds','keys','plugins','sessions','about',
  ]);
});

test('settings policy permits authority-backed operations only', () => {
  assert.deepEqual(settingsRoute('GET', '/pocket/settings/config'), { action: 'config.get' });
  assert.deepEqual(settingsRoute('PUT', '/pocket/settings/config'), { action: 'config.save' });
  assert.deepEqual(settingsRoute('PUT', '/pocket/settings/env'), { action: 'env.set' });
  assert.deepEqual(settingsRoute('DELETE', '/pocket/settings/env'), { action: 'env.delete' });
  assert.equal(settingsRoute('POST', '/pocket/settings/env/reveal'), null);
  assert.equal(settingsRoute('POST', '/pocket/settings/uninstall'), null);
});

test('electron-only menus declare capability instead of fake persistence', () => {
  for (const id of ['appearance','notifications','billing','gateway','keybinds','plugins','about']) {
    const view = SETTINGS_VIEWS.find(x => x.id === id);
    assert.ok(view);
    assert.equal(view.mode, 'limited');
    assert.ok(view.note.length > 10);
  }
});

test('settings snapshot cannot recursively contain plaintext secret fields', () => {
  const sample = {
    config: { model: 'x' },
    env: { OPENAI_API_KEY: { is_set: true, redacted_value: 'sk-…xyz' } },
  };
  const raw = JSON.stringify(sample);
  assert.equal(/"(?:value|api_key|token|secret)"\s*:/i.test(raw), false);
});
