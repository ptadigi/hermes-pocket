// Pure, network-free WebSocket fan-out logic for canonical session bridging.
// One connection subscribes to exactly one session at a time (the client's active session).

export function createHub() {
  return { bySession: new Map(), byConn: new Map(), state: new Map() };
}

export function subscribe(hub, conn, sessionId) {
  unsubscribe(hub, conn);
  if (!hub.bySession.has(sessionId)) hub.bySession.set(sessionId, new Set());
  hub.bySession.get(sessionId).add(conn);
  hub.byConn.set(conn, sessionId);
}

export function unsubscribe(hub, conn) {
  const prev = hub.byConn.get(conn);
  if (prev == null) return;
  const set = hub.bySession.get(prev);
  if (set) { set.delete(conn); if (set.size === 0) hub.bySession.delete(prev); }
  hub.byConn.delete(conn);
}

export const subscribersFor = (hub, sessionId) => [...(hub.bySession.get(sessionId) || [])];
export const activeSessions = hub => [...hub.bySession.keys()];
export const hasSubscribers = (hub, sessionId) => (hub.bySession.get(sessionId)?.size || 0) > 0;

// Decide whether a freshly-fetched row set represents new canonical activity
// worth pushing to subscribers, without re-sending unchanged state every tick.
export function pollDecision(hub, sessionId, rows) {
  const latestId = Math.max(0, ...(rows || []).map(m => Number(m.id) || 0));
  const count = (rows || []).length;
  const prev = hub.state.get(sessionId);
  const changed = !prev || prev.latestId !== latestId || prev.count !== count;
  hub.state.set(sessionId, { latestId, count });
  return changed;
}
