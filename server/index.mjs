import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createPocketServer } from './app.mjs';
import { attachPocketRealtime } from './ws-transport.mjs';
import { createSettingsRunner } from './settings-runner.mjs';
import { createSharedQueueStore } from './shared-queue-store.mjs';
import { discoverProfiles, resolveHermesHome } from './profile-registry.mjs';
import { requireLoopbackHost } from './host-policy.mjs';

const required = name => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const port = Number(process.env.POCKET_PORT || 9999);
const host = requireLoopbackHost(process.env.POCKET_HOST);
const runtimeSnapshotPath = process.env.HERMES_RUNTIME_SNAPSHOT || resolve(process.env.APPDATA || '.', 'Hermes', 'runtime-sessions.json');
const sharedQueuePath = process.env.HERMES_SHARED_QUEUE || resolve(process.env.APPDATA || '.', 'Hermes', 'shared-composer-queue.json');

// Every profile that exists on this machine is discovered from the Hermes
// home directory (profiles/<name>/.env) — nothing here names a specific
// profile. Cached briefly so a burst of requests doesn't re-read disk per call.
const hermesHome = resolveHermesHome(
  process.env.HERMES_HOME || resolve(process.env.LOCALAPPDATA || process.env.APPDATA || '.', 'hermes'),
);
let profileCache = null, profileCacheAt = 0;
const PROFILE_CACHE_MS = 5000;
const profileProvider = async () => {
  const now = Date.now();
  if (profileCache && now - profileCacheAt < PROFILE_CACHE_MS) return profileCache;
  profileCache = await discoverProfiles(hermesHome);
  profileCacheAt = now;
  return profileCache;
};

const server = createPocketServer({
  authSecret: required('POCKET_AUTH_SECRET'),
  password: required('POCKET_PASSWORD'),
  hermesKey: required('API_SERVER_KEY'),
  hermesBase: process.env.HERMES_API_BASE || 'http://127.0.0.1:8642',
  staticDir: resolve('dist'),
  settingsRunner: createSettingsRunner(),
  runtimeSnapshotPath,
  sharedQueueStore: createSharedQueueStore(sharedQueuePath),
  profileProvider,
});
attachPocketRealtime(server, {
  authSecret: required('POCKET_AUTH_SECRET'),
  hermesKey: required('API_SERVER_KEY'),
  hermesBase: process.env.HERMES_API_BASE || 'http://127.0.0.1:8642',
  profileProvider,
});
server.listen(port, host, () => console.log(`Hermes Pocket listening on http://${host}:${port}`));
