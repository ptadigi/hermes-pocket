// Pure, client-local queue operations for the Pocket composer. The queue is a
// per-client waiting list of prompts the user lined up while a turn was busy;
// it is NOT canonical and does not sync across clients. Each entry carries a
// stable id so the panel can edit/remove/send a specific one deterministically.

let seq = 0;
export const makeQueueEntry = (text, image, now = Date.now()) => ({
  id: `q-${now}-${(seq = (seq + 1) % 1e6)}`,
  text: typeof text === 'string' ? text : '',
  queuedAt: now,
  ...(image ? { image } : {}),
});

export const addToQueue = (queue, entry) => [...queue, entry];

export const removeFromQueue = (queue, id) => {
  const index = queue.findIndex(e => e.id === id);
  if (index < 0) return queue;
  return [...queue.slice(0, index), ...queue.slice(index + 1)];
};

// Move an entry to the front so the next auto-drain sends it next. No-op when
// the id is absent or already at the head.
export const promoteInQueue = (queue, id) => {
  const index = queue.findIndex(e => e.id === id);
  if (index <= 0) return queue;
  const entry = queue[index];
  return [entry, ...queue.slice(0, index), ...queue.slice(index + 1)];
};

// Rewrite an entry's text. Empty/blank text is rejected (returns the queue
// unchanged) so a save never strands an unsendable blank entry in the panel.
export const editQueueText = (queue, id, text) => {
  const next = typeof text === 'string' ? text.trim() : '';
  if (!next) return queue;
  let changed = false;
  const out = queue.map(e => {
    if (e.id !== id || e.text === next) return e;
    changed = true;
    return { ...e, text: next };
  });
  return changed ? out : queue;
};

export const queueLabel = count => (count > 0 ? `Đang chờ · ${count} tin` : '');

// One-line preview for a queued entry row.
export const entryPreview = entry => {
  const text = (entry?.text || '').trim();
  if (text) return text;
  return entry?.image ? '[Ảnh đính kèm]' : '(tin trống)';
};
