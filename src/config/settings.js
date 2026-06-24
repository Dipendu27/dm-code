// DM Code — Configuration Manager
import Conf from 'conf';
import { TOOL_NAME, MODEL_VERSION, DEFAULT_MODEL_ID } from './constants.js';

const schema = {
  apiKeys: {
    type: 'object',
    default: {},
  },
  selectedModelId: {
    type: 'string',
    default: DEFAULT_MODEL_ID,
  },
  theme: {
    type: 'string',
    enum: ['dark', 'light'],
    default: 'dark',
  },
  maxTokens: {
    type: 'number',
    default: 8096,
  },
  verbose: {
    type: 'boolean',
    default: false,
  },
  autoApprove: {
    type: 'boolean',
    default: false,
  },
  historyLimit: {
    type: 'number',
    default: 50,
  },
  firstRun: {
    type: 'boolean',
    default: true,
  },
};

export const config = new Conf({
  projectName: 'dm-code',
  schema,
  projectVersion: MODEL_VERSION,
});

// ── Model selection ──────────────────────────────────────────────────────────
export function getSelectedModelId() {
  return process.env.DM_MODEL || config.get('selectedModelId') || DEFAULT_MODEL_ID;
}

export function setSelectedModelId(id) {
  config.set('selectedModelId', id);
}

// ── API keys — one per provider ───────────────────────────────────────────────
export function getApiKey(provider) {
  // Env vars take priority
  const envMap = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    google:    process.env.GOOGLE_API_KEY,
    groq:      process.env.GROQ_API_KEY,
    mistral:   process.env.MISTRAL_API_KEY,
  };
  if (envMap[provider]) return envMap[provider];
  const keys = config.get('apiKeys') || {};
  return keys[provider] || '';
}

export function setApiKey(provider, key) {
  const keys = config.get('apiKeys') || {};
  keys[provider] = key;
  config.set('apiKeys', keys);
}

export function getAllApiKeys() {
  return config.get('apiKeys') || {};
}

// ── General config helpers ────────────────────────────────────────────────────
export function getConfig(key) {
  return config.get(key);
}

export function setConfig(key, value) {
  config.set(key, value);
}

export function getAllConfig() {
  const cfg = config.store;
  // Mask raw key values in display
  const masked = { ...cfg };
  if (masked.apiKeys) {
    masked.apiKeys = Object.fromEntries(
      Object.entries(masked.apiKeys).map(([k, v]) => [k, v ? '●●●● set' : 'not set'])
    );
  }
  return masked;
}

export function resetConfig() {
  config.clear();
}

export function isFirstRun() {
  return config.get('firstRun') !== false;
}

export function markFirstRunDone() {
  config.set('firstRun', false);
}
