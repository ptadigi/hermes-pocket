import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';

const env = {};
for (const line of readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('='); env[line.slice(0, i)] = line.slice(i + 1);
}
const hermesBase = env.HERMES_API_BASE, hermesHeaders = { authorization: `Bearer ${env.API_SERVER_KEY}`, 'content-type': 'application/json' };
const pocketHost = env.POCKET_HOST || '127.0.0.1', pocketPort = Number(env.POCKET_PORT || 9999);
const pocketBase = `http://${pocketHost}:${pocketPort}`;
const id = `pocket_ws_e2e_${Date.now()}`;

const login = async () => {
  const r = await fetch(`${pocketBase}/pocket/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: env.POCKET_PASSWORD }) });
  if (r.status !== 200) throw new Error(`login ${r.status}`);
  return r.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
};

// Minimal raw WebSocket client over net.Socket: real HTTP upgrade with a real
// browser-forbidden-elsewhere Cookie header, so this proves what the actual
// same-origin browser client will send once authenticated via HttpOnly cookie.
function openRawWs(cookie, sessionId, onFrame) {
  return new Promise((resolve_, reject) => {
    const socket = net.connect(pocketPort, pocketHost, () => {
      const key = randomBytes(16).toString('base64');
      socket.write(
        `GET /pocket/ws?session=${sessionId} HTTP/1.1\r\n` +
        `Host: ${pocketHost}:${pocketPort}\r\n` +
        `Origin: ${pocketBase}\r\n` +
        `Cookie: ${cookie}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let handshaked = false, buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!handshaked) {
        const idx = buffer.indexOf('\r\n\r\n');
        if (idx === -1) return;
        const head = buffer.subarray(0, idx).toString();
        buffer = buffer.subarray(idx + 4);
        if (!head.startsWith('HTTP/1.1 101')) { reject(new Error('handshake failed: ' + head.split('\r\n')[0])); return; }
        handshaked = true; resolve_(socket);
      }
      while (buffer.length >= 2) {
        const len = buffer[1] & 0x7f;
        let offset = 2, payloadLen = len;
        if (len === 126) { if (buffer.length < 4) return; payloadLen = buffer.readUInt16BE(2); offset = 4; }
        if (buffer.length < offset + payloadLen) return;
        const payload = buffer.subarray(offset, offset + payloadLen);
        buffer = buffer.subarray(offset + payloadLen);
        try { onFrame(JSON.parse(payload.toString())); } catch {}
      }
    });
    socket.on('error', reject);
  });
}

try {
  let r = await fetch(hermesBase + '/api/sessions', { method: 'POST', headers: hermesHeaders, body: JSON.stringify({ id, title: 'Hermes Pocket WS E2E', source: 'api_server' }) });
  if (r.status !== 201) throw new Error(`create ${r.status}: ${await r.text()}`);

  const cookieA = await login(), cookieB = await login();
  const framesA = [], framesB = [];
  const socketA = await openRawWs(cookieA, id, f => framesA.push(f));
  const socketB = await openRawWs(cookieB, id, f => framesB.push(f));

  r = await fetch(`${hermesBase}/api/sessions/${id}/chat/stream`, { method: 'POST', headers: hermesHeaders, body: JSON.stringify({ message: 'Trả lời đúng một từ: POCKET_WS_OK' }) });
  if (!r.ok) throw new Error(`stream ${r.status}: ${await r.text()}`);
  await r.text();

  const waitForChanged = async (frames, ms = 8000) => {
    const start = Date.now();
    while (Date.now() - start < ms) { if (frames.some(f => f.type === 'session.changed')) return true; await new Promise(res => setTimeout(res, 100)); }
    return false;
  };
  const [changedA, changedB] = await Promise.all([waitForChanged(framesA), waitForChanged(framesB)]);

  r = await fetch(`${hermesBase}/api/sessions/${id}/messages`, { headers: hermesHeaders });
  const messages = (await r.json()).data || [];

  console.log(JSON.stringify({
    session: id,
    clientAReceivedChange: changedA,
    clientBReceivedChange: changedB,
    frameTypesA: [...new Set(framesA.map(f => f.type))],
    frameTypesB: [...new Set(framesB.map(f => f.type))],
    persistedMessages: messages.length,
    roles: messages.map(m => m.role),
  }, null, 2));

  socketA.destroy(); socketB.destroy();
  if (!changedA || !changedB || messages.length < 2) process.exitCode = 1;
} finally {
  await fetch(`${hermesBase}/api/sessions/${id}`, { method: 'DELETE', headers: hermesHeaders }).catch(() => {});
}
