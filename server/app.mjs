import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { allowedHermesRoute, isMutation } from './proxy-policy.mjs';
import { settingsRoute, validEnvKey } from './settings-policy.mjs';
import { csrfCookie, csrfMatches, issueSession, parseCookies, secureCookie, verifySession } from './security.mjs';
import { normalizeRuntimeSnapshot } from './runtime-status.mjs';
import { publicProfileList, resolveProfileTarget } from './profile-registry.mjs';
import { safeMediaFile, mediaMime } from './media-route.mjs';

// Roots the BFF may serve local MEDIA:<path> images from. Fail closed when no
// root is configured; never widen access to the complete user profile implicitly.
const MEDIA_ROOTS = (process.env.POCKET_MEDIA_ROOTS || process.env.HERMES_HOME || '').split(';').map(s => s.trim()).filter(Boolean);

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const equalText = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const loginBucket = req => {
  const peer = req.socket.remoteAddress || 'unknown';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) return peer;
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return isIP(forwarded) ? forwarded : peer;
};
const readBody = async (req, max = 12 * 1024 * 1024) => {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('payload_too_large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
};
const mime = path => ({ '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon' }[extname(path)] || 'application/octet-stream');

function session(req, authSecret) { return verifySession(parseCookies(req.headers.cookie).hp_session, authSecret); }

export function createPocketServer({ authSecret, password, hermesKey, hermesBase = 'http://127.0.0.1:8642', staticDir, settingsRunner = null, runtimeSnapshotPath = null, sharedQueueStore = null, profileProvider = null }) {
  if (!authSecret || authSecret.length < 16 || !password || !hermesKey) throw new Error('Missing secure server configuration');
  const loginAttempts = new Map();
  // Resolve which Hermes runtime a request targets. With no provider the BFF
  // keeps its single legacy upstream; with one, the client picks a discovered
  // profile per request and each profile carries its own port + bearer key.
  const upstreamFor = async requested => {
    if (!profileProvider) return { id: 'default', base: hermesBase, key: hermesKey, prefix: '' };
    return resolveProfileTarget(await profileProvider(), requested ?? null);
  };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('permissions-policy', 'camera=(self), microphone=(self), geolocation=()');
      res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data: https:; media-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

      if (url.pathname === '/pocket/health' && req.method === 'GET') {
        return json(res, 200, { status: 'ok', service: 'hermes-pocket' });
      }

      if (url.pathname === '/pocket/auth/login' && req.method === 'POST') {
        const bucket = loginBucket(req);
        let payload; try { payload = JSON.parse((await readBody(req, 16_384)).toString() || '{}'); } catch { return json(res, 400, { error: 'invalid_json' }); }
        const now = Date.now(), current = loginAttempts.get(bucket);
        if (current?.count >= 5 && current.until > now) return json(res, 429, { error: 'rate_limited' }, { 'retry-after': String(Math.ceil((current.until - now) / 1000)) });
        if (equalText(payload.password || '', password)) {
          loginAttempts.delete(bucket);
          const csrf = randomBytes(24).toString('base64url');
          res.setHeader('set-cookie', [secureCookie('hp_session', issueSession(authSecret, Date.now(), csrf)), csrfCookie(csrf)]);
          return json(res, 200, { ok: true });
        }
        const fresh = !current || current.until <= now;
        loginAttempts.set(bucket, { count: fresh ? 1 : current.count + 1, until: fresh ? now + 300_000 : current.until });
        return json(res, 401, { error: 'invalid_credentials' });
      }
      if (url.pathname === '/pocket/auth/session' && req.method === 'GET') return json(res, session(req, authSecret) ? 200 : 401, { authenticated: Boolean(session(req, authSecret)) });
      if (url.pathname === '/pocket/auth/logout' && req.method === 'POST') {
        res.setHeader('set-cookie', [secureCookie('hp_session','',0), csrfCookie('',0)]); return json(res, 200, { ok: true });
      }

      if (url.pathname === '/pocket/profiles' && req.method === 'GET') {
        if (!session(req, authSecret)) return json(res, 401, { error: 'unauthorized' });
        if (!profileProvider) return json(res, 200, { profiles: [{ id: 'default', port: null, configured: true, sticky: true }] });
        return json(res, 200, { profiles: publicProfileList(await profileProvider()) });
      }

      if (url.pathname === '/pocket/runtime/sessions' && req.method === 'GET') {
        if (!session(req, authSecret)) return json(res, 401, { error: 'unauthorized' });
        let raw = null;
        if (runtimeSnapshotPath) {
          try { raw = JSON.parse(readFileSync(runtimeSnapshotPath, 'utf8')); }
          catch { raw = null; }
        }
        return json(res, 200, normalizeRuntimeSnapshot(raw));
      }

      if (url.pathname === '/pocket/queue' && req.method === 'GET') {
        if (!session(req, authSecret)) return json(res, 401, { error: 'unauthorized' });
        if (!sharedQueueStore) return json(res, 503, { error: 'queue_unavailable' });
        return json(res, 200, await sharedQueueStore.read());
      }

      if (url.pathname === '/pocket/queue/mutate' && req.method === 'POST') {
        const auth = session(req, authSecret);
        if (!auth) return json(res, 401, { error: 'unauthorized' });
        if (!sharedQueueStore) return json(res, 503, { error: 'queue_unavailable' });
        const cookies = parseCookies(req.headers.cookie);
        if (!csrfMatches(auth.csrf, cookies.hp_csrf, req.headers['x-csrf-token'])) return json(res, 403, { error: 'csrf' });
        let payload;
        try { payload = JSON.parse((await readBody(req, 64_000)).toString() || '{}'); }
        catch { return json(res, 400, { error: 'invalid_json' }); }
        try { return json(res, 200, await sharedQueueStore.mutate(payload)); }
        catch (error) {
          const status = error?.code === 'revision_conflict' ? 409 : error?.code === 'queue_busy' ? 503 : 400;
          return json(res, status, { error: error?.code || 'invalid_queue_request', ...(status === 409 ? { current: await sharedQueueStore.read() } : {}) });
        }
      }

      if (url.pathname.startsWith('/pocket/settings/')) {
        const auth = session(req, authSecret);
        if (!auth) return json(res, 401, { error: 'unauthorized' });
        if (!settingsRunner) return json(res, 503, { error: 'settings_unavailable' });
        const cookies = parseCookies(req.headers.cookie);
        if (isMutation(req.method) && !csrfMatches(auth.csrf, cookies.hp_csrf, req.headers['x-csrf-token'])) return json(res, 403, { error: 'csrf' });
        const request = settingsRoute(req.method, url.pathname);
        if (!request) return json(res, 404, { error: 'route_not_allowed' });
        if (isMutation(req.method)) {
          let payload;
          try { payload = JSON.parse((await readBody(req, 1_000_000)).toString() || '{}'); }
          catch { return json(res, 400, { error: 'invalid_json' }); }
          if (request.action === 'config.save') request.config = payload.config;
          else if (request.action === 'env.set') { request.key = payload.key; request.value = payload.value; }
          else if (request.action === 'env.delete') request.key = payload.key;
          else if (request.action === 'providers.custom.save') request.endpoint = payload.endpoint;
          if (request.action.startsWith('env.') && !validEnvKey(request.key)) return json(res, 400, { error: 'invalid_env_key' });
        }
        const result = await settingsRunner(request);
        return json(res, 200, result);
      }

      if (url.pathname === '/pocket/media' && ['GET','HEAD'].includes(req.method)) {
        const auth = session(req, authSecret); if (!auth) return json(res, 401, { error: 'unauthorized' });
        const file = safeMediaFile(url.searchParams.get('path'), MEDIA_ROOTS);
        if (!file) return json(res, 404, { error: 'not_found' });
        res.writeHead(200, { 'content-type': mediaMime(file), 'cache-control': 'private, max-age=86400' });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(file).pipe(res);
      }

      if (url.pathname.startsWith('/pocket/api/')) {
        const auth = session(req, authSecret); if (!auth) return json(res, 401, { error: 'unauthorized' });
        const targetPath = '/' + url.pathname.slice('/pocket/api/'.length) + url.search;
        if (!allowedHermesRoute(req.method, targetPath)) return json(res, 404, { error: 'route_not_allowed' });
        const cookies = parseCookies(req.headers.cookie);
        if (isMutation(req.method) && !csrfMatches(auth.csrf, cookies.hp_csrf, req.headers['x-csrf-token'])) return json(res, 403, { error: 'csrf' });
        const target = await upstreamFor(req.headers['x-pocket-profile']);
        if (!target) return json(res, 404, { error: 'profile_not_available' });
        const body = isMutation(req.method) ? await readBody(req) : undefined;
        // Named profiles live behind the shared listener's /p/<id>/ prefix.
        const upstream = await fetch(new URL((target.prefix || '') + targetPath, target.base), {
          method: req.method, body: body?.length ? body : undefined, duplex: body?.length ? 'half' : undefined,
          headers: { authorization: `Bearer ${target.key}`, accept: req.headers.accept || '*/*', ...(body?.length ? {'content-type': req.headers['content-type'] || 'application/json'} : {}) },
        });
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream', 'cache-control':'no-store' });
        if (upstream.body) { for await (const chunk of upstream.body) res.write(chunk); }
        return res.end();
      }

      if (staticDir && ['GET','HEAD'].includes(req.method)) {
        let relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        if (relative.includes('..')) return json(res, 404, { error: 'not_found' });
        let file = normalize(join(staticDir, relative));
        if (!file.startsWith(normalize(staticDir))) return json(res, 404, { error: 'not_found' });
        if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticDir, 'index.html');
        if (!existsSync(file)) return json(res, 503, { error: 'app_not_built' });
        res.writeHead(200, { 'content-type': mime(file), 'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(file).pipe(res);
      }
      json(res, 404, { error: 'not_found' });
    } catch (error) {
      json(res, error?.message === 'payload_too_large' ? 413 : 502, { error: error?.message === 'payload_too_large' ? 'payload_too_large' : 'upstream_unavailable' });
    }
  });
}
