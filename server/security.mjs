import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TTL_MS = 86_400_000;
const encode = (value) => Buffer.from(value).toString('base64url');
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url');

export function issueSession(secret, now = Date.now(), csrf = randomBytes(24).toString('base64url')) {
  const payload = encode(JSON.stringify({ iat: now, csrf }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isFinite(data.iat) || now - data.iat > TTL_MS || now < data.iat) return null;
    return { csrf: data.csrf };
  } catch { return null; }
}

export function csrfMatches(sessionValue, cookieValue, headerValue) {
  if (!sessionValue || !cookieValue || !headerValue) return false;
  const session = Buffer.from(sessionValue);
  const cookie = Buffer.from(cookieValue);
  const header = Buffer.from(headerValue);
  return session.length === cookie.length
    && cookie.length === header.length
    && timingSafeEqual(session, cookie)
    && timingSafeEqual(cookie, header);
}

export function validReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim().split(/=(.*)/s)).filter(([k, v]) => k && v !== undefined).map(([k, v]) => [k, decodeURIComponent(v)]));
}

export function secureCookie(name, value, maxAge = 86_400) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function csrfCookie(value, maxAge = 86_400) {
  return `hp_csrf=${encodeURIComponent(value)}; Path=/; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
