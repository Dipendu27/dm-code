// DM Code — Configuration Manager
import Conf from 'conf';
import fsNode from 'fs';
import pathNode from 'path';
import { TOOL_NAME, MODEL_VERSION, DEFAULT_MODEL_ID } from './constants.js';

// ── Load .env file (zero-dependency) ────────────────────────────────────────
// Loads variables from .env in cwd into process.env.
// Only sets variables that are not already set (existing env takes priority).
(function loadDotenv(dir = process.cwd()) {
  const envPath = pathNode.join(dir, '.env');
  if (!fsNode.existsSync(envPath)) return;
  try {
    const lines = fsNode.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch { /* .env load failure is non-fatal */ }
})();

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
