import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProfiles, publicProfileList, resolveHermesHome, resolveProfileTarget } from '../server/profile-registry.mjs';

// Keys must clear the runtime's own strength floor (min 16 chars), matching
// hermes `has_usable_secret(key, min_length=16)`.
const KEY_DEFAULT = 'default-key-0123456789';
const KEY_CULIAI = 'culiai-key-0123456789';
const KEY_WP = 'wordpress-key-0123456789';

// Only the default profile owns the listener (ENABLED + PORT). Named profiles
// are reached through that same listener via /p/<id>/ and therefore carry a
// key ONLY — never their own ENABLED/PORT.
const listenerEnv = (port = 8642, key = KEY_DEFAULT) =>
  `API_SERVER_ENABLED=true\nAPI_SERVER_PORT=${port}\nAPI_SERVER_KEY=${key}\n`;

const makeHome = async layout => {
  const home = await mkdtemp(join(tmpdir(), 'hermes-home-'));
  if (layout.base !== undefined) await writeFile(join(home, '.env'), layout.base);
  if (layout.active !== undefined) await writeFile(join(home, 'active_profile'), layout.active);
  for (const [name, body] of Object.entries(layout.profiles || {})) {
    await mkdir(join(home, 'profiles', name), { recursive: true });
    if (body !== null) await writeFile(join(home, 'profiles', name, '.env'), body);
  }
  return home;
};

test('Hermes home expands Windows environment variables and tilde', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local', USERPROFILE: 'C:\\Users\\demo' };
  assert.equal(resolveHermesHome('%LOCALAPPDATA%\\hermes', env), 'C:\\Users\\demo\\AppData\\Local\\hermes');
  assert.equal(resolveHermesHome('~\\AppData\\Local\\hermes', env), 'C:\\Users\\demo\\AppData\\Local\\hermes');
});

test('discovery enumerates every profile present on the machine, not a hardcoded list', async () => {
  const home = await makeHome({
    base: listenerEnv(),
    profiles: {
      culiai: `API_SERVER_KEY=${KEY_CULIAI}\n`,
      'wordpress-': `API_SERVER_KEY=${KEY_WP}\n`,
      brandnew: `API_SERVER_KEY=brandnew-key-0123456789\n`,
    },
  });
  try {
    const profiles = await discoverProfiles(home);
    assert.deepEqual(profiles.map(p => p.id), ['default', 'brandnew', 'culiai', 'wordpress-']);
    // A profile discovered purely from the filesystem is reachable with no
    // per-profile port: it shares the single listener.
    assert.equal(profiles.find(p => p.id === 'brandnew').configured, true);
    assert.equal(profiles.find(p => p.id === 'default').base, 'http://127.0.0.1:8642');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('named profiles share the single listener base and port (multiplex, not per-port)', async () => {
  const home = await makeHome({
    base: listenerEnv(8642),
    profiles: { culiai: `API_SERVER_KEY=${KEY_CULIAI}\n` },
  });
  try {
    const profiles = await discoverProfiles(home);
    const culiai = profiles.find(p => p.id === 'culiai');
    assert.equal(culiai.configured, true);
    assert.equal(culiai.base, 'http://127.0.0.1:8642', 'named profile must reuse the listener base');
    assert.equal(culiai.port, 8642, 'named profile must not invent its own port');
    assert.equal(culiai.prefix, '/p/culiai');
    // Its bearer is its OWN key: the listener key is rejected on a named prefix.
    assert.equal(culiai.key, KEY_CULIAI);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('a named profile without its own key is listed but unreachable', async () => {
  const home = await makeHome({
    base: listenerEnv(),
    profiles: { culiai: 'MODEL=x\n', empty: null },
  });
  try {
    const profiles = await discoverProfiles(home);
    assert.deepEqual(profiles.map(p => [p.id, p.configured]), [['default', true], ['culiai', false], ['empty', false]]);
    assert.equal(profiles.find(p => p.id === 'culiai').port, null);
    assert.equal(profiles.find(p => p.id === 'culiai').key, null);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('a key below the runtime strength floor counts as unconfigured', async () => {
  const home = await makeHome({
    base: listenerEnv(),
    profiles: { weak: 'API_SERVER_KEY=short\n' },
  });
  try {
    const profiles = await discoverProfiles(home);
    assert.equal(profiles.find(p => p.id === 'weak').configured, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('no listener means every profile is unreachable, including keyed ones', async () => {
  const home = await makeHome({
    base: `API_SERVER_ENABLED=false\nAPI_SERVER_PORT=8642\nAPI_SERVER_KEY=${KEY_DEFAULT}\n`,
    profiles: { culiai: `API_SERVER_KEY=${KEY_CULIAI}\n` },
  });
  try {
    const profiles = await discoverProfiles(home);
    assert.deepEqual(profiles.map(p => [p.id, p.configured]), [['default', false], ['culiai', false]]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('sticky active profile is reported for default selection', async () => {
  const home = await makeHome({
    base: listenerEnv(),
    active: 'culiai\n',
    profiles: { culiai: `API_SERVER_KEY=${KEY_CULIAI}\n` },
  });
  try {
    const profiles = await discoverProfiles(home);
    assert.equal(profiles.find(p => p.id === 'culiai').sticky, true);
    assert.equal(profiles.find(p => p.id === 'default').sticky, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('public list never exposes upstream keys', async () => {
  const home = await makeHome({
    base: listenerEnv(8642, 'super-secret-value-0123'),
    profiles: { culiai: 'API_SERVER_KEY=another-secret-0123456\n' },
  });
  try {
    const listed = publicProfileList(await discoverProfiles(home));
    const serialized = JSON.stringify(listed);
    assert.ok(!serialized.includes('super-secret-value-0123'));
    assert.ok(!serialized.includes('another-secret-0123456'));
    assert.ok(!serialized.includes('key'));
    assert.deepEqual(Object.keys(listed[0]).sort(), ['configured', 'id', 'port', 'sticky']);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('target resolution rejects unknown or unconfigured profiles', async () => {
  const profiles = [
    { id: 'default', configured: true, base: 'http://127.0.0.1:8642', key: 'k1', port: 8642, sticky: false },
    { id: 'culiai', configured: false, base: null, key: null, port: null, sticky: true },
  ];
  assert.deepEqual(resolveProfileTarget(profiles, 'default'), {
    id: 'default', base: 'http://127.0.0.1:8642', key: 'k1', prefix: '',
  });
  assert.equal(resolveProfileTarget(profiles, 'culiai'), null);
  assert.equal(resolveProfileTarget(profiles, 'ghost'), null);
  assert.equal(resolveProfileTarget(profiles, '../../etc'), null);
  assert.equal(resolveProfileTarget(profiles, ''), null);
});

test('resolved target carries the /p/<id> prefix for named profiles only', async () => {
  const profiles = [
    { id: 'default', configured: true, base: 'http://127.0.0.1:8642', key: 'k1', port: 8642, sticky: false },
    { id: 'culiai', configured: true, base: 'http://127.0.0.1:8642', key: 'k2', port: 8642, sticky: true },
  ];
  assert.equal(resolveProfileTarget(profiles, 'default').prefix, '');
  const culiai = resolveProfileTarget(profiles, 'culiai');
  assert.equal(culiai.prefix, '/p/culiai');
  assert.equal(culiai.base, 'http://127.0.0.1:8642', 'same listener, prefix carries the routing');
  assert.equal(culiai.key, 'k2');
  // Callers build the upstream URL as base + prefix + path.
  assert.equal(new URL(culiai.prefix + '/api/sessions', culiai.base).href, 'http://127.0.0.1:8642/p/culiai/api/sessions');
});

test('fallback target is the requested-or-default profile', async () => {
  const profiles = [
    { id: 'default', configured: true, base: 'http://127.0.0.1:8642', key: 'k1', port: 8642, sticky: false },
    { id: 'culiai', configured: true, base: 'http://127.0.0.1:8642', key: 'k2', port: 8642, sticky: true },
  ];
  assert.equal(resolveProfileTarget(profiles, undefined).id, 'default');
  assert.equal(resolveProfileTarget(profiles, null).id, 'default');
  assert.equal(resolveProfileTarget(profiles, 'culiai').id, 'culiai');
});
