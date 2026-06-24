// DM Code — Interactive Model Picker
// Beautiful terminal UI for choosing from all free models

import readline from 'readline';
import chalk from 'chalk';
import { MODELS, THEME, getModelById } from '../config/constants.js';
import { getApiKey, setApiKey, setSelectedModelId, getSelectedModelId } from '../config/settings.js';

const c = {
  primary:  (t) => chalk.hex(THEME.primary)(t),
  success:  (t) => chalk.hex(THEME.success)(t),
  error:    (t) => chalk.hex(THEME.error)(t),
  warning:  (t) => chalk.hex(THEME.warning)(t),
  info:     (t) => chalk.hex(THEME.info)(t),
  muted:    (t) => chalk.hex(THEME.muted)(t),
  code:     (t) => chalk.hex(THEME.code)(t),
  tool:     (t) => chalk.hex(THEME.tool)(t),
  dim:      (t) => chalk.dim(t),
  bold:     (t) => chalk.bold(t),
};

// Provider colour badges
const PROVIDER_COLORS = {
  anthropic: { bg: '#CC785C', fg: '#000000', label: 'Anthropic' },
  google:    { bg: '#4285F4', fg: '#FFFFFF', label: 'Google'    },
  groq:      { bg: '#F55036', fg: '#FFFFFF', label: 'Groq'      },
  mistral:   { bg: '#7C3AED', fg: '#FFFFFF', label: 'Mistral'   },
};

const TIER_COLORS = {
  FREE:       chalk.hex('#22C55E').bold('FREE'),
  FREE_QUOTA: chalk.hex('#F59E0B').bold('FREE*'),
};

// ─── Main entry: show the picker, return chosen model entry ──────────────────
export async function showModelPicker(options = {}) {
  const { title = 'Choose your Annihilator engine', showApiSetup = true } = options;

  console.clear();
  printPickerHeader(title);
  printModelTable();

  const currentId = getSelectedModelId();
  const current   = getModelById(currentId);

  console.log();
  console.log(
    c.muted('  Current: ') +
    providerBadge(current.provider) + ' ' +
    c.bold(current.displayName)
  );
  console.log(c.muted('  Enter a number (1–' + MODELS.length + ') or press Enter to keep current:'));
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const chosen = await new Promise((resolve) => {
    rl.question(c.primary('  ❯ '), (answer) => {
      rl.close();
      const n = parseInt(answer.trim(), 10);
      if (!answer.trim()) resolve(current);
      else if (n >= 1 && n <= MODELS.length) resolve(MODELS[n - 1]);
      else resolve(current);
    });
  });

  // Save choice
  setSelectedModelId(chosen.id);
  console.log();
  console.log(
    c.success('  ✓ Selected: ') +
    providerBadge(chosen.provider) + ' ' +
    c.bold(chosen.displayName)
  );

  // Check if we have an API key for this provider
  if (showApiSetup) {
    const key = getApiKey(chosen.provider);
    if (!key) {
      await promptForApiKey(chosen);
    } else {
      console.log(c.muted('  API key: ') + c.success('already set ✓'));
    }
  }

  console.log();
  return chosen;
}

// ─── Prompt the user for an API key for the chosen provider ──────────────────
export async function promptForApiKey(model) {
  console.log();
  console.log(c.warning('  ⚠ No API key found for ') + providerBadge(model.provider));
  console.log();
  console.log(c.muted('  Get your free key at: ') + c.info(model.apiKeyUrl));
  console.log(c.muted('  Env var:              ') + c.code(model.apiKeyEnv));
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const key = await new Promise((resolve) => {
    rl.question(c.primary('  Paste API key (or Enter to skip): '), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (key) {
    setApiKey(model.provider, key);
    console.log(c.success('  ✓ API key saved for ') + providerBadge(model.provider));
  } else {
    console.log(c.muted('  Skipped. Set it later with: ') + c.code(`dmcode keys set ${model.provider} YOUR_KEY`));
    console.log(c.muted('  Or export: ') + c.code(`export ${model.apiKeyEnv}=YOUR_KEY`));
  }
}

// ─── Print the header ─────────────────────────────────────────────────────────
function printPickerHeader(title) {
  const line = '─'.repeat(70);
  console.log();
  console.log(c.muted('  ' + line));
  console.log('  ' + c.primary('⚡') + ' ' + chalk.bold.white(title));
  console.log(c.muted('  ' + line));
  console.log();
  console.log(
    c.muted('  ') +
    TIER_COLORS.FREE + c.muted(' = permanently free  ') +
    TIER_COLORS.FREE_QUOTA + c.muted(' = free with monthly quota')
  );
  console.log();
}

// ─── Print the full model table ───────────────────────────────────────────────
function printModelTable() {
  let idx = 0;
  let currentProvider = null;

  for (const model of MODELS) {
    // Provider section header
    if (model.provider !== currentProvider) {
      currentProvider = model.provider;
      const pc = PROVIDER_COLORS[model.provider] || { bg: '#888', fg: '#fff' };
      const badge = chalk.bgHex(pc.bg).hex(pc.fg).bold(` ${model.providerLabel} `);
      console.log('  ' + badge);
    }

    idx++;
    const num    = c.muted(String(idx).padStart(2) + '. ');
    const name   = (model.recommended
      ? chalk.bold.white(model.displayName) + c.primary(' ✦')
      : chalk.white(model.displayName)
    ).padEnd(model.recommended ? 36 : 34);

    const tier   = TIER_COLORS[model.tier] || c.muted(model.tier);
    const speed  = c.muted(model.speed.padEnd(12));
    const stars  = c.code(model.quality);
    const ctx    = c.dim(model.context.padEnd(12));

    console.log(`  ${num}${name} ${tier.padEnd ? tier : tier}  ${speed}  ${stars}  ${ctx}`);
    console.log(c.muted(`      ${model.bestFor}`));
    console.log();
  }
}

// ─── Inline model switcher (used from /model command in REPL) ─────────────────
export async function inlineModelSwitcher(inputHandler) {
  // Pause the readline so we can take over input
  inputHandler.pause();

  const chosen = await showModelPicker({ title: 'Switch Annihilator engine', showApiSetup: true });

  inputHandler.resume();
  return chosen;
}

// ─── Print a compact one-line model status ────────────────────────────────────
export function printCurrentModel() {
  const id    = getSelectedModelId();
  const model = getModelById(id);
  console.log(
    c.muted('  Engine: ') +
    providerBadge(model.provider) + ' ' +
    c.bold(model.displayName) + ' ' +
    c.muted(`(${model.context}, ${model.speed})`)
  );
}

// ─── Helper: coloured provider badge ─────────────────────────────────────────
export function providerBadge(provider) {
  const pc = PROVIDER_COLORS[provider] || { bg: '#888', fg: '#fff', label: provider };
  return chalk.bgHex(pc.bg).hex(pc.fg)(` ${pc.label} `);
}
