// DM Code — Core Constants
// Model: Annihilator — multi-provider, all free tiers supported

export const TOOL_NAME     = 'DM Code';
export const TOOL_BINARY   = 'dm';
export const MODEL_NAME    = 'annihilator';
export const MODEL_DISPLAY = 'Annihilator';
export const MODEL_VERSION = '1.3.4';
export const TOOL_VERSION  = '1.3.4';

export const MAX_TOKENS              = 8192;
export const MAX_CONTEXT_TOKENS      = 1_000_000;
export const TEMPERATURE             = 1.0;
export const COMPACT_THRESHOLD       = 0.50;  // Compact at 50% context usage
export const AUTO_COMPACT_THRESHOLD  = 0.70;  // Auto-compact at 70% context usage
export const OLLAMA_BASE_URL         = 'http://localhost:11434';

// ─── Model Registry ──────────────────────────────────────────────────────────
// All entries are free-tier or have a generous free quota.
// Tier key:  FREE = truly free, FREE_QUOTA = free with monthly quota limit
//
export const MODELS = [
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    id:            'claude-haiku-4-5-20251001',
    displayName:   'Claude Haiku 4.5',
    provider:      'anthropic',
    providerLabel: 'Anthropic',
    tier:          'FREE_QUOTA',
    speed:         'Fastest',
    quality:       '★★★★☆',
    context:       '200K tokens',
    contextTokens: 200_000,
    bestFor:       'Quick tasks, code completion, fast iteration',
    apiKeyEnv:     'ANTHROPIC_API_KEY',
    apiKeyUrl:     'https://console.anthropic.com',
    recommended:   true,
  },
  {
    id:            'claude-sonnet-4-6',
    displayName:   'Claude Sonnet 4.6',
    provider:      'anthropic',
    providerLabel: 'Anthropic',
    tier:          'FREE_QUOTA',
    speed:         'Fast',
    quality:       '★★★★★',
    context:       '1M tokens',
    contextTokens: 1_000_000,
    bestFor:       'Complex refactoring, architecture, debugging',
    apiKeyEnv:     'ANTHROPIC_API_KEY',
    apiKeyUrl:     'https://console.anthropic.com',
    recommended:   false,
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  {
    id:            'gemini-3.5-flash',
    displayName:   'Gemini 3.5 Flash',
    provider:      'google',
    providerLabel: 'Google AI',
    tier:          'FREE',
    speed:         'Fastest',
    quality:       '★★★★☆',
    context:       '1M tokens',
    contextTokens: 1_000_000,
    bestFor:       'Large codebase analysis, massive context tasks',
    apiKeyEnv:     'GOOGLE_API_KEY',
    apiKeyUrl:     'https://aistudio.google.com/app/apikey',
    recommended:   true,
  },
  {
    id:            'gemini-2.5-pro',
    displayName:   'Gemini 2.5 Pro',
    provider:      'google',
    providerLabel: 'Google AI',
    tier:          'FREE',
    speed:         'Medium',
    quality:       '★★★★★',
    context:       '1M tokens',
    contextTokens: 1_000_000,
    bestFor:       'Hard algorithmic problems, deep reasoning',
    apiKeyEnv:     'GOOGLE_API_KEY',
    apiKeyUrl:     'https://aistudio.google.com/app/apikey',
    recommended:   false,
  },
  {
    id:            'gemini-2.5-flash',
    displayName:   'Gemini 2.5 Flash',
    provider:      'google',
    providerLabel: 'Google AI',
    tier:          'FREE',
    speed:         'Very Fast',
    quality:       '★★★☆☆',
    context:       '1M tokens',
    contextTokens: 1_000_000,
    bestFor:       'Lightweight coding tasks, large file reads',
    apiKeyEnv:     'GOOGLE_API_KEY',
    apiKeyUrl:     'https://aistudio.google.com/app/apikey',
    recommended:   false,
  },

  // ── Groq (ultra-fast inference) ───────────────────────────────────────────
  {
    id:            'openai/gpt-oss-120b',
    displayName:   'GPT-OSS 120B (Groq)',
    provider:      'groq',
    providerLabel: 'Groq',
    tier:          'FREE',
    speed:         'Ultra-fast',
    quality:       '★★★★☆',
    context:       '128K tokens',
    contextTokens: 128_000,
    bestFor:       'General coding, fastest open-source quality',
    apiKeyEnv:     'GROQ_API_KEY',
    apiKeyUrl:     'https://console.groq.com/keys',
    recommended:   true,
  },
  {
    id:            'openai/gpt-oss-20b',
    displayName:   'GPT-OSS 20B (Groq)',
    provider:      'groq',
    providerLabel: 'Groq',
    tier:          'FREE',
    speed:         'Instant',
    quality:       '★★★☆☆',
    context:       '128K tokens',
    contextTokens: 128_000,
    bestFor:       'Super-fast small tasks, scripts, one-liners',
    apiKeyEnv:     'GROQ_API_KEY',
    apiKeyUrl:     'https://console.groq.com/keys',
    recommended:   false,
  },
  {
    id:            'qwen/qwen3.6-27b',
    displayName:   'Qwen3.6 27B',
    provider:      'groq',
    providerLabel: 'Groq',
    tier:          'FREE',
    speed:         'Fast',
    quality:       '★★★★★',
    context:       '128K tokens',
    contextTokens: 128_000,
    bestFor:       'Multilingual reasoning, dense-model quality at open-weight speed',
    apiKeyEnv:     'GROQ_API_KEY',
    apiKeyUrl:     'https://console.groq.com/keys',
    recommended:   false,
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  {
    id:            'mistral-small-latest',
    displayName:   'Mistral Small',
    provider:      'mistral',
    providerLabel: 'Mistral AI',
    tier:          'FREE_QUOTA',
    speed:         'Fast',
    quality:       '★★★★☆',
    context:       '128K tokens',
    contextTokens: 128_000,
    bestFor:       'European data privacy, multilingual code',
    apiKeyEnv:     'MISTRAL_API_KEY',
    apiKeyUrl:     'https://console.mistral.ai/api-keys',
    recommended:   false,
  },
  {
    id:            'codestral-latest',
    displayName:   'Codestral',
    provider:      'mistral',
    providerLabel: 'Mistral AI',
    tier:          'FREE_QUOTA',
    speed:         'Fast',
    quality:       '★★★★★',
    context:       '32K tokens',
    contextTokens: 32_000,
    bestFor:       'Code-only tasks — fill-in-the-middle, completions',
    apiKeyEnv:     'MISTRAL_API_KEY',
    apiKeyUrl:     'https://console.mistral.ai/api-keys',
    recommended:   false,
  },
];

// Default model on first run
export const DEFAULT_MODEL_ID = 'gemini-3.5-flash'; // matches the recommended:true Google entry

// Get a model entry by ID
export function getModelById(id) {
  const found = MODELS.find(m => m.id === id);
  if (!found) {
    console.warn(`[dmcode] Unknown model ID "${id}" — falling back to ${MODELS[0].id}. Run "dmcode models" to see valid IDs.`);
    return MODELS[0];
  }
  return found;
}

// Get unique providers
export function getProviders() {
  const seen = new Set();
  return MODELS.filter(m => {
    if (seen.has(m.provider)) return false;
    seen.add(m.provider);
    return true;
  }).map(m => ({ id: m.provider, label: m.providerLabel }));
}

// Tool IDs
export const TOOL_IDS = {
  READ_FILE:    'read_file',
  WRITE_FILE:   'write_file',
  EDIT_FILE:    'edit_file',
  RUN_COMMAND:  'run_command',
  LIST_FILES:   'list_files',
  SEARCH_FILES: 'search_files',
  CREATE_DIR:   'create_directory',
  DELETE_FILE:  'delete_file',
  MOVE_FILE:    'move_file',
  WEB_FETCH:    'web_fetch',
  MEMORY_READ:  'memory_read',
  MEMORY_WRITE: 'memory_write',
  UPDATE_TODOS: 'update_todos',
};

// UI theme — exact Claude Code colour palette
export const THEME = {
  primary:   '#CC785C',
  secondary: '#6B6B6B',
  success:   '#22C55E',
  error:     '#EF4444',
  warning:   '#F59E0B',
  info:      '#3B82F6',
  muted:     '#6B7280',
  code:      '#A78BFA',
  tool:      '#FB923C',
  user:      '#FFFFFF',
  assistant: '#E2E8F0',
  border:    '#374151',
  bg:        '#0D1117',
};

export const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

// Build platform-aware system prompt at runtime
function getPlatformInfo() {
  const os = process.platform;
  const arch = process.arch;
  const platformMap = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };
  const archMap = { arm64: 'ARM64 (Apple Silicon / ARM)', x64: 'x86_64', ia32: 'x86' };
  const osName = platformMap[os] || os;
  const archName = archMap[arch] || arch;

  const hints = [];
  if (os === 'darwin') {
    hints.push('Homebrew paths are typically /opt/homebrew (ARM) or /usr/local (Intel).');
  } else if (os === 'win32') {
    hints.push('Use PowerShell or CMD syntax. Paths use backslashes. Common tools: winget, choco, scoop.');
  } else if (os === 'linux') {
    hints.push('Common package managers: apt, yum, dnf, pacman. Paths are Unix-style.');
  }
  return { osName, archName, hints: hints.join(' ') };
}

export function buildSystemPrompt() {
  const { osName, archName, hints } = getPlatformInfo();
  return `You are Annihilator, an expert AI coding assistant — the engine behind DM Code.
You are built for serious software engineering work: writing, reading, refactoring, debugging, and deploying production-quality code.

You run in an agentic loop with access to the developer's local filesystem and terminal. You think step-by-step before acting.

Core principles:
- Understand the full codebase context before making changes
- Prefer surgical edits over rewrites unless a rewrite is clearly better
- Always explain your reasoning before using tools
- When writing code, follow the idioms and conventions of the project
- Security and correctness come before cleverness
- If uncertain about intent, ask a clarifying question before acting
- Respect existing architecture; suggest improvements but do not impose them

You have access to tools: read files, write files, edit files, run shell commands, list directories, search code, create directories, delete files, move files, fetch URLs, read/write session memory, and update a task checklist.

For any task with 3 or more distinct steps, call update_todos at the start to lay out your plan, mark each item in_progress immediately before starting it and completed immediately after finishing it, and always pass the full list on every call. Skip this for single-step or purely conversational requests.

When using tools:
- Chain tool calls efficiently to complete multi-step tasks
- Prefer reading before writing to understand existing code
- Run tests after making changes when test commands are available
- Report what you did concisely after completing a task

You are running on ${osName} (${archName}). ${hints}`;
}

// Kept for backward compatibility — resolves at import time
export const ANNIHILATOR_SYSTEM_PROMPT = buildSystemPrompt();
