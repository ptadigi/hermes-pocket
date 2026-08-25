const url = process.env.POCKET_URL || 'http://127.0.0.1:9999/pocket/auth/session';
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  console.log(JSON.stringify({ reachable: true, status: response.status }));
  process.exit(response.status === 401 || response.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ reachable: false, error: error.name }));
  process.exit(1);
}
