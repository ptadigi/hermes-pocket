// Pure reconnect-backoff decision, testable without a real socket/network.
export const nextBackoffMs = attempt => Math.min(500 * 2 ** Math.max(0, attempt), 8000);

export const shouldReconcile = (frame, activeSessionId) => {
  try {
    const data = typeof frame === 'string' ? JSON.parse(frame) : frame;
    return data?.type === 'session.changed' && data?.sessionId === activeSessionId;
  } catch { return false; }
};
