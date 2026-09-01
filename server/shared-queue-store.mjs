import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const ENTRY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_TEXT = 20_000;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 120_000;
const LOCK_WAIT_MS = 5_000;
const STALE_LOCK_MS = 30_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const emptyState = () => ({ revision: 0, sessions: {} });
const copyState = state => JSON.parse(JSON.stringify(state));

function queueError(message, code = 'invalid_queue_request') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeId(value, pattern, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!pattern.test(text)) throw queueError(`Invalid ${label}`);
  return text;
}

function normalizeEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw queueError('Invalid queue entry');
  const id = safeId(value.id, ENTRY_ID_RE, 'entry id');
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (!text || text.length > MAX_TEXT) throw queueError('Invalid queue text');
  const queuedAt = Number(value.queuedAt);
  if (!Number.isSafeInteger(queuedAt) || queuedAt < 0) throw queueError('Invalid queuedAt');
  const source = value.source === 'desktop' ? 'desktop' : value.source === 'pocket' ? 'pocket' : null;
  if (!source) throw queueError('Invalid queue source');
  const entry = { id, text, queuedAt, source };
  if (
    typeof value.claimedBy === 'string' && OWNER_RE.test(value.claimedBy) &&
    Number.isSafeInteger(value.claimUntil) && value.claimUntil > Date.now()
  ) {
    entry.claimedBy = value.claimedBy;
    entry.claimUntil = value.claimUntil;
  }
  return entry;
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState();
  const revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  const sessions = {};
  if (value.sessions && typeof value.sessions === 'object' && !Array.isArray(value.sessions)) {
    for (const [rawId, rawQueue] of Object.entries(value.sessions)) {
      if (!SESSION_RE.test(rawId) || !Array.isArray(rawQueue)) continue;
      const queue = [];
      for (const raw of rawQueue) {
        try { queue.push(normalizeEntry(raw)); } catch {}
      }
      if (queue.length) sessions[rawId] = queue;
    }
  }
  return { revision, sessions };
}

async function readState(path) {
  try { return normalizeState(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return emptyState();
    throw error;
  }
}

async function atomicWrite(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
  await rename(temp, path);
}

async function acquireLock(lockPath) {
  const started = Date.now();
  await mkdir(dirname(lockPath), { recursive: true });
  while (Date.now() - started < LOCK_WAIT_MS) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
      return async () => {
        await handle.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
          await unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {}
      await sleep(15 + Math.floor(Math.random() * 20));
    }
  }
  throw queueError('Queue store is busy', 'queue_busy');
}

function applyMutation(state, request) {
  if (!request || typeof request !== 'object') throw queueError('Invalid queue mutation');
  if (request.expectedRevision !== undefined && request.expectedRevision !== state.revision) {
    throw queueError('Queue revision conflict', 'revision_conflict');
  }
  const sessionId = safeId(request.sessionId, SESSION_RE, 'session id');
  const queue = state.sessions[sessionId] ? [...state.sessions[sessionId]] : [];
  const op = request.op;
  const owner = request.owner === undefined ? null : safeId(request.owner, OWNER_RE, 'queue owner');
  const claimedByOther = entry => Boolean(
    entry?.claimedBy && entry.claimUntil > Date.now() && entry.claimedBy !== owner
  );
  let changed = false;

  if (op === 'append') {
    const entry = normalizeEntry(request.entry);
    if (queue.some(item => item.id === entry.id)) throw queueError('Duplicate queue entry id');
    queue.push(entry);
    changed = true;
  } else if (op === 'edit') {
    const id = safeId(request.id, ENTRY_ID_RE, 'entry id');
    const text = typeof request.text === 'string' ? request.text.trim() : '';
    if (!text || text.length > MAX_TEXT) throw queueError('Invalid queue text');
    const index = queue.findIndex(item => item.id === id);
    if (index < 0) throw queueError('Queue entry not found', 'queue_entry_not_found');
    if (claimedByOther(queue[index])) throw queueError('Queue entry is claimed', 'queue_claimed');
    if (queue[index].text !== text) { queue[index] = { ...queue[index], text }; changed = true; }
  } else if (op === 'promote') {
    const id = safeId(request.id, ENTRY_ID_RE, 'entry id');
    const index = queue.findIndex(item => item.id === id);
    if (index < 0) throw queueError('Queue entry not found', 'queue_entry_not_found');
    if (claimedByOther(queue[index])) throw queueError('Queue entry is claimed', 'queue_claimed');
    if (index > 0) { const [entry] = queue.splice(index, 1); queue.unshift(entry); changed = true; }
  } else if (op === 'remove') {
    const id = safeId(request.id, ENTRY_ID_RE, 'entry id');
    const index = queue.findIndex(item => item.id === id);
    if (index < 0) throw queueError('Queue entry not found', 'queue_entry_not_found');
    if (claimedByOther(queue[index])) throw queueError('Queue entry is claimed', 'queue_claimed');
    queue.splice(index, 1);
    changed = true;
  } else if (op === 'claim') {
    const id = safeId(request.id, ENTRY_ID_RE, 'entry id');
    if (!owner) throw queueError('Queue owner is required');
    const leaseMs = Number(request.leaseMs);
    if (!Number.isSafeInteger(leaseMs) || leaseMs < MIN_LEASE_MS || leaseMs > MAX_LEASE_MS) {
      throw queueError('Invalid queue lease');
    }
    const index = queue.findIndex(item => item.id === id);
    if (index < 0) throw queueError('Queue entry not found', 'queue_entry_not_found');
    if (claimedByOther(queue[index])) throw queueError('Queue entry is claimed', 'queue_claimed');
    queue[index] = { ...queue[index], claimedBy: owner, claimUntil: Date.now() + leaseMs };
    changed = true;
  } else if (op === 'release') {
    const id = safeId(request.id, ENTRY_ID_RE, 'entry id');
    if (!owner) throw queueError('Queue owner is required');
    const index = queue.findIndex(item => item.id === id);
    if (index < 0) throw queueError('Queue entry not found', 'queue_entry_not_found');
    if (claimedByOther(queue[index])) throw queueError('Queue entry is claimed', 'queue_claimed');
    const { claimedBy: _claimedBy, claimUntil: _claimUntil, ...released } = queue[index];
    queue[index] = released;
    changed = true;
  } else {
    throw queueError('Unsupported queue operation');
  }

  if (!changed) return state;
  const next = { revision: state.revision + 1, sessions: { ...state.sessions } };
  if (queue.length) next.sessions[sessionId] = queue;
  else delete next.sessions[sessionId];
  return next;
}

export function createSharedQueueStore(path) {
  const lockPath = `${path}.lock`;
  return {
    async read() { return copyState(await readState(path)); },
    async mutate(request) {
      const release = await acquireLock(lockPath);
      try {
        const current = await readState(path);
        const next = applyMutation(current, request);
        if (next !== current) await atomicWrite(path, next);
        return copyState(next);
      } finally { await release(); }
    }
  };
}
