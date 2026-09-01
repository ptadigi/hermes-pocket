export const mergeQueueForSession = (snapshot, sessionId, localOnly = []) => {
  const shared = sessionId ? (snapshot?.sessions?.[sessionId] || []) : [];
  return [...shared, ...localOnly].sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
};

export const isSharedEntry = entry => entry?.source === 'desktop' || entry?.source === 'pocket';

export const canDrainSession = (runtime, sessionId, localBusy) => {
  if (localBusy || !runtime?.available || !sessionId) return false;
  const row = runtime.sessions?.find(item => item.id === sessionId || item.session_key === sessionId);
  return row?.status === 'idle';
};

export async function mutateWithReconcile({ api, payload, revision, apply }) {
  try {
    const next = await api.mutateQueue({ ...payload, expectedRevision: revision.current });
    revision.current = next.revision;
    apply(next);
    return next;
  } catch (error) {
    if (error?.code !== 'revision_conflict' || !error.current) throw error;
    revision.current = error.current.revision;
    apply(error.current);
    const next = await api.mutateQueue({ ...payload, expectedRevision: revision.current });
    revision.current = next.revision;
    apply(next);
    return next;
  }
}
