import test from 'node:test';
import assert from 'node:assert/strict';
import { chatUrl, isSettingsLocation, settingsUrl } from '../src/lib/ios-navigation.mjs';

test('Settings is a real history route without losing the canonical session', () => {
  assert.equal(settingsUrl('?session=abc_123'), '?session=abc_123&settings=1');
  assert.equal(settingsUrl('?settings=1&session=abc_123'), '?settings=1&session=abc_123');
  assert.equal(isSettingsLocation('?session=abc_123&settings=1'), true);
  assert.equal(isSettingsLocation('?session=abc_123'), false);
  assert.equal(chatUrl('?settings=1&session=abc_123'), '?session=abc_123');
});
