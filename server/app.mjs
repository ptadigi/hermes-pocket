import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { allowedHermesRoute, isMutation } from './proxy-policy.mjs';
import { settingsRoute, validEnvKey } from './settings-policy.mjs';
import { csrfCookie, csrfMatches, issueSession, parseCookies, secureCookie, verifySession } from './security.mjs';

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const equalText = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const readBody = async (req, max = 12 * 1024 * 1024) => {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('payload_too_large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
};
const mime = path => ({ '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon' }[extname(path)] || 'application/octet-stream');

function session(req, authSecret) { return verifySession(parseCookies(req.headers.cookie).hp_session, authSecret); }

export function createPocketServer({ authSecret, password, hermesKey, hermesBase = 'http://127.0.0.1:8642', staticDir, settingsRunner = null }) {
  if (!authSecret || authSecret.length < 16 || !password || !hermesKey) throw new Error('Missing secure server configuration');
  const loginAttempts = new Map();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('permissions-policy', 'camera=(self), microphone=(self), geolocation=()');
      res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data: https:; media-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

      if (url.pathname === '/pocket/auth/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'unknown', now = Date.now(), current = loginAttempts.get(ip);
        if (current?.count >= 5 && current.until > now) return json(res, 429, { error: 'rate_limited' }, { 'retry-after': String(Math.ceil((current.until - now) / 1000)) });
        let payload; try { payload = JSON.parse((await readBody(req, 16_384)).toString() || '{}'); } catch { return json(res, 400, { error: 'invalid_json' }); }
        if (!equalText(payload.password || '', password)) {
          const fresh = !current || current.until <= now;
          loginAttempts.set(ip, { count: fresh ? 1 : current.count + 1, until: fresh ? now + 300_000 : current.until });
          return json(res, 401, { error: 'invalid_credentials' });
        }
        loginAttempts.delete(ip);
        const csrf = randomBytes(24).toString('base64url');
        res.setHeader('set-cookie', [secureCookie('hp_session', issueSession(authSecret, Date.now(), csrf)), csrfCookie(csrf)]);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/pocket/auth/session' && req.method === 'GET') return json(res, session(req, authSecret) ? 200 : 401, { authenticated: Boolean(session(req, authSecret)) });
      if (url.pathname === '/pocket/auth/logout' && req.method === 'POST') {
        res.setHeader('set-cookie', [secureCookie('hp_session','',0), csrfCookie('',0)]); return json(res, 200, { ok: true });
      }

      if (url.pathname.startsWith('/pocket/settings/')) {
        const auth = session(req, authSecret);
        if (!auth) return json(res, 401, { error: 'unauthorized' });
        if (!settingsRunner) return json(res, 503, { error: 'settings_unavailable' });
        const cookies = parseCookies(req.headers.cookie);
        if (isMutation(req.method) && !csrfMatches(cookies.hp_csrf, req.headers['x-csrf-token'])) return json(res, 403, { error: 'csrf' });
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

      if (url.pathname.startsWith('/pocket/api/')) {
        const auth = session(req, authSecret); if (!auth) return json(res, 401, { error: 'unauthorized' });
        const targetPath = '/' + url.pathname.slice('/pocket/api/'.length) + url.search;
        if (!allowedHermesRoute(req.method, targetPath)) return json(res, 404, { error: 'route_not_allowed' });
        const cookies = parseCookies(req.headers.cookie);
        if (isMutation(req.method) && !csrfMatches(cookies.hp_csrf, req.headers['x-csrf-token'])) return json(res, 403, { error: 'csrf' });
        const body = isMutation(req.method) ? await readBody(req) : undefined;
        const upstream = await fetch(new URL(targetPath, hermesBase), {
          method: req.method, body: body?.length ? body : undefined, duplex: body?.length ? 'half' : undefined,
          headers: { authorization: `Bearer ${hermesKey}`, accept: req.headers.accept || '*/*', ...(body?.length ? {'content-type': req.headers['content-type'] || 'application/json'} : {}) },
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
