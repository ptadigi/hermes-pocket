// Canonical live-session status for Pocket, derived from the Desktop-written
// snapshot. The snapshot is the same in-memory truth Desktop paints its sidebar
// dots from (`session.active_list`): it does NOT resume/focus/mutate a chat and
// carries no secrets. Pocket only ever mirrors it — never invents liveness from
// timestamps or message content.
//
// Fail-closed by design: a missing snapshot (Desktop not running / not writing
// yet) or a stale one (older than SNAPSHOT_TTL_MS) reports `available:false`, so
// the PWA shows an "unknown/offline" pip rather than a false green.

export const SNAPSHOT_TTL_MS = 60_000;

// The authoritative live states that mean the agent is actively holding a turn.
// Everything else (idle / absent) is "not running".
const RUNNING_STATES = new Set(['working', 'waiting', 'starting']);
const SAFE_STATES = new Set(['working', 'waiting', 'starting', 'idle']);

const asString = value => (typeof value === 'string' ? value.trim() : '');

/**
 * Reduce a raw Desktop snapshot to the minimal, secret-free shape Pocket serves.
 * Only `id`, `session_key` and a whitelisted `status` survive.
 */
export function normalizeRuntimeSnapshot(raw, nowMs = Date.now(), profileKey = 'default') {
  const empty = { available: false, sessions: [] };
  if (!raw || typeof raw !== 'object') return empty;

  const generatedAt = Number(raw.generated_at);
  if (!Number.isFinite(generatedAt) || nowMs - generatedAt > SNAPSHOT_TTL_MS) return empty;

  const profile = raw.profiles?.[profileKey];
  const rows = Array.isArray(profile?.sessions) ? profile.sessions : [];

  const sessions = [];
  for (const row of rows) {
    const id = asString(row?.id);
    const sessionKey = asString(row?.session_key);
    const status = asString(row?.status);
    if (!id || !sessionKey || !SAFE_STATES.has(status)) continue;
    sessions.push({ id, session_key: sessionKey, status });
  }

  return { available: true, sessions };
}

/**
 * Map a stored session id to a UI pip state.
 *  - 'unavailable' → no trustworthy snapshot (grey/offline)
 *  - 'running'     → an authoritative live turn (green)
 *  - 'stopped'     → known-idle or not live (red/idle)
 */
export function sessionRuntimeState(storedSessionId, snapshot) {
  if (!snapshot || snapshot.available !== true) return 'unavailable';
  const match = snapshot.sessions.find(s => s.session_key === storedSessionId);
  if (match && RUNNING_STATES.has(match.status)) return 'running';
  return 'stopped';
}
