export const SETTINGS_SECTIONS = [
  { id: 'model', label: 'Model', icon: '◈', keys: ['model', 'model_context_length', 'fallback_providers'] },
  { id: 'chat', label: 'Chat', icon: '◌', keys: ['display.personality', 'timezone', 'display.show_reasoning', 'agent.image_input_mode'] },
  { id: 'appearance', label: 'Giao diện', icon: '◐', local: true, keys: [] },
  { id: 'workspace', label: 'Workspace', icon: '▣', keys: ['terminal.cwd', 'desktop.repo_scan_enabled', 'desktop.repo_scan_roots', 'desktop.repo_scan_exclude_paths', 'code_execution.mode', 'terminal.persistent_shell', 'terminal.env_passthrough', 'file_read_max_chars'] },
  { id: 'safety', label: 'An toàn', icon: '◆', keys: ['approvals.mode', 'approvals.timeout', 'approvals.mcp_reload_confirm', 'command_allowlist', 'security.redact_secrets', 'security.allow_private_urls', 'browser.allow_private_urls', 'browser.auto_local_for_private_urls', 'checkpoints.enabled'] },
  { id: 'memory', label: 'Memory & Context', icon: '◎', keys: ['memory.memory_enabled', 'memory.user_profile_enabled', 'memory.memory_char_limit', 'memory.user_char_limit', 'memory.provider', 'context.engine', 'compression.enabled', 'compression.threshold', 'compression.target_ratio', 'compression.protect_last_n'] },
  { id: 'voice', label: 'Giọng nói', icon: '◉', keys: ['tts.provider', 'stt.enabled', 'stt.echo_transcripts', 'stt.provider', 'voice.auto_tts', 'tts.edge.voice', 'tts.openai.model', 'tts.openai.voice', 'tts.elevenlabs.voice_id', 'tts.elevenlabs.model_id', 'tts.xai.voice_id', 'tts.xai.language', 'tts.xai.speed', 'tts.minimax.model', 'tts.minimax.voice_id', 'tts.mistral.model', 'tts.mistral.voice_id', 'tts.gemini.model', 'tts.gemini.voice', 'tts.neutts.model', 'tts.neutts.device', 'tts.kittentts.model', 'tts.kittentts.voice', 'tts.piper.voice', 'stt.local.model', 'stt.local.language', 'stt.openai.model', 'stt.groq.model', 'stt.mistral.model', 'voice.max_recording_seconds'] },
  { id: 'advanced', label: 'Nâng cao', icon: '◇', keys: ['toolsets', 'terminal.backend', 'terminal.timeout', 'terminal.docker_image', 'terminal.singularity_image', 'terminal.modal_image', 'terminal.daytona_image', 'tool_output.max_bytes', 'tool_output.max_lines', 'tool_output.max_line_length', 'checkpoints.max_snapshots', 'agent.max_turns', 'agent.api_max_retries', 'agent.service_tier', 'agent.tool_use_enforcement', 'delegation.model', 'delegation.provider', 'delegation.max_iterations', 'delegation.max_concurrent_children', 'delegation.child_timeout_seconds', 'delegation.reasoning_effort', 'updates.non_interactive_local_changes'] },
  { id: 'notifications', label: 'Thông báo', icon: '◍', deviceOnly: true },
  { id: 'billing', label: 'Usage & Billing', icon: '▥', deviceOnly: true },
  { id: 'providers', label: 'Providers', icon: 'ϟ', provider: true },
  { id: 'gateway', label: 'Gateway', icon: '⊕', deviceOnly: true },
  { id: 'keybinds', label: 'Phím tắt', icon: '⌘', deviceOnly: true },
  { id: 'keys', label: 'API Keys', icon: '⚿', credentials: true },
  { id: 'plugins', label: 'Plugins', icon: '⬡', deviceOnly: true },
  { id: 'sessions', label: 'Chat đã lưu trữ', icon: '▤', sessions: true },
  { id: 'about', label: 'Giới thiệu', icon: 'ⓘ', about: true },
];

const TITLES = {
  model: 'Default Model', model_context_length: 'Context Window', fallback_providers: 'Fallback Models',
  'display.personality': 'Personality', timezone: 'Timezone', 'display.show_reasoning': 'Reasoning Blocks',
  'agent.image_input_mode': 'Image Attachments', 'terminal.cwd': 'Working Directory',
  'approvals.mode': 'Approval Mode', 'security.redact_secrets': 'Redact Secrets',
  'memory.memory_enabled': 'Persistent Memory', 'memory.user_profile_enabled': 'User Profile',
  'compression.enabled': 'Auto-Compression', 'compression.threshold': 'Compression Threshold',
  'tts.provider': 'Text-To-Speech Provider', 'stt.enabled': 'Speech To Text', 'stt.provider': 'Speech-To-Text Provider',
  toolsets: 'Enabled Toolsets', 'terminal.backend': 'Execution Backend', 'agent.max_turns': 'Max Agent Steps',
  'delegation.max_concurrent_children': 'Parallel Subagents',
};

export const fieldTitle = key => TITLES[key] || key.split('.').at(-1).replaceAll('_', ' ').replace(/\b\w/g, x => x.toUpperCase());
export function getPath(source, path) { return path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, source); }
export function setPath(source, path, value) {
  const result = structuredClone(source || {}), parts = path.split('.'); let cursor = result;
  parts.forEach((part, index) => { if (index === parts.length - 1) cursor[part] = value; else cursor = cursor[part] && typeof cursor[part] === 'object' && !Array.isArray(cursor[part]) ? cursor[part] : (cursor[part] = {}); });
  return result;
}
export function inputValue(value, type) {
  if (type === 'boolean') return Boolean(value);
  if (type === 'number') return value === '' ? 0 : Number(value);
  if (type === 'list') return String(value).split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  return value;
}
export function visibleFields(section, schema) { return (section.keys || []).filter(key => schema?.fields?.[key]); }
