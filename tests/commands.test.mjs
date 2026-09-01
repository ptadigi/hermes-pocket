import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, isCommandDraft, parseCommand, matchCommands, matchSkills } from '../src/lib/commands.mjs';

const SKILLS = [
  { name: 'wordpress-elementor', description: 'Edit Elementor pages', category: 'wordpress' },
  { name: 'wordpress-seo-content-publishing', description: 'Publish SEO content', category: 'wordpress' },
  { name: 'seo-total', description: 'Audit SEO end-to-end', category: 'seo' },
  { name: 'hermes-agent', description: 'Configure Hermes', category: 'autonomous-ai-agents' },
];

test('matchSkills returns nothing until at least one letter follows the slash', () => {
  assert.deepEqual(matchSkills('/', SKILLS), []);
  assert.deepEqual(matchSkills('hello', SKILLS), []);
});

test('matchSkills ranks name-prefix before substring and searches description', () => {
  const names = matchSkills('/word', SKILLS).map((s) => s.name);
  assert.deepEqual(names, ['wordpress-elementor', 'wordpress-seo-content-publishing']);
  // substring on name
  assert.ok(matchSkills('/seo', SKILLS).some((s) => s.name === 'wordpress-seo-content-publishing'));
  assert.ok(matchSkills('/seo', SKILLS).some((s) => s.name === 'seo-total'));
});

test('matchSkills stops once the draft carries an argument space', () => {
  assert.deepEqual(matchSkills('/word press', SKILLS), []);
});

test('matchSkills orders each bucket alphabetically so the cap is predictable', () => {
  // Real catalogs arrive grouped by category, not sorted, so an unsorted cap
  // silently hides obvious matches (wordpress-elementor fell outside top 8).
  const unsorted = [
    { name: 'wordpress-router', description: '', category: '' },
    { name: 'wordpress-penetration-testing', description: '', category: '' },
    { name: 'wordpress', description: '', category: '' },
    { name: 'wordpress-elementor', description: '', category: '' },
    { name: 'wordpress-client-site-ops', description: '', category: '' },
  ];
  assert.deepEqual(
    matchSkills('/word', unsorted).map((s) => s.name),
    [
      'wordpress',
      'wordpress-client-site-ops',
      'wordpress-elementor',
      'wordpress-penetration-testing',
      'wordpress-router',
    ]
  );
});

test('matchSkills caps the result list', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ name: `wp-skill-${i}`, description: '', category: '' }));
  assert.ok(matchSkills('/wp', many).length <= 8);
});

test('slash draft detection only fires at start of an empty-prefix draft', () => {
  assert.equal(isCommandDraft('/'), true);
  assert.equal(isCommandDraft('/mo'), true);
  assert.equal(isCommandDraft('  /model'), true);
  assert.equal(isCommandDraft('nhắn /model'), false);
  assert.equal(isCommandDraft(''), false);
  assert.equal(isCommandDraft('model'), false);
});

test('every registered command has id, label, hint and a stable arg contract', () => {
  assert.ok(COMMANDS.length >= 6);
  for (const command of COMMANDS) {
    assert.match(command.id, /^[a-z]+$/);
    assert.ok(command.label.length > 0);
    assert.ok(command.hint.length > 0);
    assert.equal(typeof command.takesArgs, 'boolean');
  }
  const ids = COMMANDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('parseCommand splits the verb from its argument remainder', () => {
  assert.deepEqual(parseCommand('/model kiro'), { id: 'model', arg: 'kiro' });
  assert.deepEqual(parseCommand('/queue viết test đi'), { id: 'queue', arg: 'viết test đi' });
  assert.deepEqual(parseCommand('/new'), { id: 'new', arg: '' });
  assert.deepEqual(parseCommand('  /retry  '), { id: 'retry', arg: '' });
  assert.equal(parseCommand('/khongtontai'), null);
  assert.equal(parseCommand('không phải command'), null);
});

test('matchCommands ranks prefix hits before substring hits and returns all on bare slash', () => {
  assert.equal(matchCommands('/').length, COMMANDS.length);
  const model = matchCommands('/mo');
  assert.equal(model[0].id, 'model');
  const none = matchCommands('/zzzzz');
  assert.deepEqual(none, []);
});

test('matchCommands stops suggesting once a complete command has an argument', () => {
  assert.deepEqual(matchCommands('/model kiro'), []);
  assert.equal(matchCommands('/model').length >= 1, true);
});
