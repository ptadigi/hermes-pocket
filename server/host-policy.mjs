const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function requireLoopbackHost(value) {
  const host = String(value || '127.0.0.1').trim().toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) throw new Error('POCKET_HOST must be loopback-only');
  return host;
}
