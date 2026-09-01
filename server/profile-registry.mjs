import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// A profile id is a filesystem directory name under profiles/. Keep it strict:
// no separators, no traversal, printable slug characters only.
const VALID_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const resolveHermesHome = (value, env = process.env) => {
  const expanded = String(value || '')
    .replace(/%([^%]+)%/g, (_match, name) => env[name] || env[name.toUpperCase()] || '')
    .replace(/^~(?=[\\/]|$)/, env.USERPROFILE || env.HOME || '~');
  return resolve(expanded);
};

const parseEnv = text => {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const readEnvFile = async path => {
  try {
    // strip BOM if a Windows editor wrote one
    return parseEnv((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
};

const truthy = v => typeof v === 'string' && ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());

// Hermes runs ONE api_server listener, owned by the default profile, and serves
// every other profile through `/p/<profile>/…` URL prefixes (gateway multiplex).
// So only the default profile's .env carries API_SERVER_ENABLED/PORT; a named
// profile is reachable as soon as it has its own API_SERVER_KEY, because
// `_check_auth` fails closed on named prefixes unless the key belongs to that
// profile. Never write ENABLED/PORT into a named profile's .env — the shared
// listener would rebind onto that port and take the default backend down.
const MIN_KEY_LENGTH = 16;

const usableKey = value => typeof value === 'string' && value.trim().length >= MIN_KEY_LENGTH;

// The single listener, resolved from the default profile's .env.
const listenerTarget = env => {
  const enabled = truthy(env.API_SERVER_ENABLED);
  const port = Number(env.API_SERVER_PORT);
  const key = env.API_SERVER_KEY;
  if (!enabled || !Number.isInteger(port) || port <= 0 || !usableKey(key)) {
    return { configured: false, base: null, key: null, port: null };
  }
  const host = env.API_SERVER_HOST && env.API_SERVER_HOST.trim() ? env.API_SERVER_HOST.trim() : '127.0.0.1';
  return { configured: true, base: `http://${host}:${port}`, key, port };
};

const readActiveProfile = async home => {
  try {
    return (await readFile(join(home, 'active_profile'), 'utf8')).trim() || null;
  } catch {
    return null;
  }
};

// Enumerate every profile that exists on the machine. "default" is the base
// hermes home (.env at the root); named profiles live under profiles/<name>/.
// This is discovery — no profile name is hardcoded into the result.
//
// Runtime topology (verified live 2026-08-28, gateway multiplex_profiles=True):
// exactly one api_server listener exists, bound from the default profile's
// .env, and it serves every other profile through `/p/<id>/…` prefixes on
// that SAME port. A named profile is "configured" once it has its own usable
// API_SERVER_KEY — it needs no port and no ENABLED flag of its own.
export async function discoverProfiles(home) {
  const active = await readActiveProfile(home);
  const entries = [];

  const listener = listenerTarget(await readEnvFile(join(home, '.env')));
  entries.push({
    id: 'default',
    configured: listener.configured,
    base: listener.base,
    key: listener.key,
    port: listener.port,
    sticky: active === 'default' || active === null,
  });

  let names = [];
  try {
    const dir = await readdir(join(home, 'profiles'), { withFileTypes: true });
    names = dir.filter(d => d.isDirectory() && VALID_ID.test(d.name)).map(d => d.name).sort();
  } catch {
    names = [];
  }

  for (const name of names) {
    const env = await readEnvFile(join(home, 'profiles', name, '.env'));
    const key = env.API_SERVER_KEY;
    // Named profile is reachable through the shared listener's /p/<name>/
    // prefix as soon as it carries its own usable key. It shares the
    // listener's base+port — it must NEVER get its own ENABLED/PORT pair,
    // that would rebind the shared listener onto a second port.
    const configured = listener.configured && usableKey(key);
    entries.push({
      id: name,
      configured,
      base: configured ? listener.base : null,
      key: configured ? key : null,
      port: configured ? listener.port : null,
      prefix: `/p/${name}`,
      sticky: active === name,
    });
  }
  return entries;
}

// Browser-facing shape: id, port, configured flag, sticky flag. Never the key/base.
export function publicProfileList(profiles) {
  return profiles.map(p => ({ id: p.id, port: p.port, configured: p.configured, sticky: p.sticky }));
}

// Resolve a requested profile id to an upstream the BFF can proxy to:
// {id, base, key, prefix}. All profiles share one `base` (the single listener);
// `prefix` is '' for default and '/p/<id>' for a named profile, so callers build
// the upstream URL as `base + prefix + path`. `key` is the profile-scoped bearer
// — the listener's own key is rejected on a named prefix (fail closed).
// Returns null when the profile is unknown, unconfigured, or the id is unsafe.
export function resolveProfileTarget(profiles, requested) {
  const wanted = requested == null ? 'default' : String(requested);
  if (!VALID_ID.test(wanted)) return null;
  const match = profiles.find(p => p.id === wanted);
  if (!match || !match.configured) return null;
  return {
    id: match.id,
    base: match.base,
    key: match.key,
    prefix: match.id === 'default' ? '' : `/p/${match.id}`,
  };
}
