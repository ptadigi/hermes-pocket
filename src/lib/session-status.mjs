// Pip state for one session. Authority order:
//   1. this client's own in-flight run (we know it is running right now)
//   2. the Desktop-published live snapshot (session.active_list mirror)
// Never derived from timestamps or message content: a missing/stale snapshot
// reports 'unavailable' so the UI shows unknown instead of a false green.

const RUNNING = new Set(['working', 'waiting', 'starting']);

export const sessionStatus = (sessionId, snapshot, localBusy = false) => {
  if (localBusy) return 'running';
  if (!snapshot || snapshot.available !== true) return 'unavailable';
  const row = snapshot.sessions?.find?.(item => item.session_key === sessionId);
  return row && RUNNING.has(row.status) ? 'running' : 'stopped';
};

export const statusLabel = state =>
  state === 'running' ? 'Đang chạy' : state === 'stopped' ? 'Đã dừng' : 'Chưa rõ trạng thái';
