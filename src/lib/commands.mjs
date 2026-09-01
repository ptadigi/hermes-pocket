// Flash command registry for the Pocket composer.
// Each command maps to a real Pocket capability backed by the Hermes API — no faked verbs.

export const COMMANDS = [
  { id: 'model', label: '/model', hint: 'Đổi model cho phiên hiện tại', takesArgs: true, argHint: 'tên model' },
  { id: 'new', label: '/new', hint: 'Mở phiên trò chuyện mới', takesArgs: false },
  { id: 'queue', label: '/queue', hint: 'Đưa nội dung vào hàng chờ lượt sau', takesArgs: true, argHint: 'nội dung' },
  { id: 'branch', label: '/branch', hint: 'Tách nhánh từ câu trả lời gần nhất', takesArgs: false },
  { id: 'regenerate', label: '/regenerate', hint: 'Chạy lại câu trả lời gần nhất', takesArgs: false },
  { id: 'retry', label: '/retry', hint: 'Gửi lại tin nhắn vừa rồi', takesArgs: false },
  { id: 'stop', label: '/stop', hint: 'Dừng phản hồi đang chạy', takesArgs: false },
  { id: 'copy', label: '/copy', hint: 'Sao chép câu trả lời gần nhất', takesArgs: false },
  { id: 'skills', label: '/skills', hint: 'Xem kỹ năng đang bật', takesArgs: false },
  { id: 'settings', label: '/settings', hint: 'Mở cài đặt', takesArgs: false },
];

const BY_ID = new Map(COMMANDS.map((command) => [command.id, command]));

// A draft is a command draft only when the first non-space character is a slash.
export function isCommandDraft(draft) {
  if (typeof draft !== 'string') return false;
  const trimmed = draft.replace(/^\s+/, '');
  return trimmed.startsWith('/');
}

// Parse a completed command draft into { id, arg }. Returns null when the verb is unknown
// or the text is not a command at all.
export function parseCommand(draft) {
  if (!isCommandDraft(draft)) return null;
  const trimmed = draft.trim();
  const match = /^\/([a-zA-Z]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return null;
  const id = match[1].toLowerCase();
  if (!BY_ID.has(id)) return null;
  return { id, arg: (match[2] || '').trim() };
}

// Suggest commands while typing. Prefix hits rank before substring hits.
// Once a complete command already carries an argument, stop suggesting.
export function matchCommands(draft) {
  if (!isCommandDraft(draft)) return [];
  const trimmed = draft.trim();
  const afterSlash = trimmed.slice(1);

  // "/model kiro" → command chosen and arg started: no more suggestions.
  const spaceAt = afterSlash.indexOf(' ');
  if (spaceAt >= 0) {
    const verb = afterSlash.slice(0, spaceAt).toLowerCase();
    return BY_ID.has(verb) ? [] : [];
  }

  const query = afterSlash.toLowerCase();
  if (query === '') return [...COMMANDS];

  const prefix = [];
  const substring = [];
  for (const command of COMMANDS) {
    if (command.id.startsWith(query)) prefix.push(command);
    else if (command.id.includes(query)) substring.push(command);
  }
  return [...prefix, ...substring];
}

/** How many skill suggestions the palette shows at once. */
export const SKILL_SUGGESTION_LIMIT = 8;

// Suggest real installed skills for `/<letters>`, the way Desktop surfaces its
// skill commands. Ranking: name prefix, then name substring, then description
// match — so `/word` leads with wordpress-* instead of an unrelated blurb hit.
export function matchSkills(draft, skills) {
  if (!isCommandDraft(draft) || !Array.isArray(skills)) return [];
  const afterSlash = draft.trim().slice(1);
  if (afterSlash === '' || afterSlash.includes(' ')) return [];

  const query = afterSlash.toLowerCase();
  const namePrefix = [];
  const nameSubstring = [];
  const descriptionMatch = [];

  for (const skill of skills) {
    const name = String(skill?.name || '').toLowerCase();
    if (!name) continue;
    if (name.startsWith(query)) namePrefix.push(skill);
    else if (name.includes(query)) nameSubstring.push(skill);
    else if (String(skill?.description || '').toLowerCase().includes(query)) descriptionMatch.push(skill);
  }

  // Catalogs arrive grouped by category, not sorted; sort each relevance bucket
  // by name so the cap keeps a stable, obvious set instead of whatever order the
  // backend happened to emit (which hid wordpress-elementor outside the top 8).
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  namePrefix.sort(byName);
  nameSubstring.sort(byName);
  descriptionMatch.sort(byName);

  return [...namePrefix, ...nameSubstring, ...descriptionMatch].slice(0, SKILL_SUGGESTION_LIMIT);
}
