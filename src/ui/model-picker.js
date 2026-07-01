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
// ─── Interactive keypress list selection ─────────────────────────────────────
async function selectFromList(items, renderItem, initialIndex = 0) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      return resolve(initialIndex);
    }
    let selected = initialIndex;
    let renderedLines = 0;

    const draw = () => {
      if (renderedLines > 0) process.stdout.write(`\x1b[${renderedLines}A`);
      process.stdout.write('\x1b[0J');
      const lines = [];
      items.forEach((item, i) => lines.push(...renderItem(item, i === selected, i).split('\n')));
      process.stdout.write(lines.join('\n') + '\n');
      renderedLines = lines.length;
    };

    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isTTY ? process.stdin.isRaw : false;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const onKeypress = (str, key) => {
      if (key.name === 'up') { selected = (selected - 1 + items.length) % items.length; draw(); }
      else if (key.name === 'down') { selected = (selected + 1) % items.length; draw(); }
      else if (key.name === 'return') { cleanup(); resolve(selected); }
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { cleanup(); resolve(null); }
      else if (/^[1-9]$/.test(str || '')) {
        const n = parseInt(str, 10) - 1;
        if (n < items.length) { selected = n; draw(); }
      }
    };

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw);
    }

    process.stdin.on('keypress', onKeypress);
    draw();
  });
}

// ─── Main entry: show the picker, return chosen model entry ──────────────────
export async function showModelPicker(options = {}) {
  const { title = 'Choose your Annihilator engine', showApiSetup = true,
          clearScreen = true, sharedRl = null } = options;

  if (clearScreen) console.clear();
  printPickerHeader(title);

  const currentId = getSelectedModelId();
  let selected = MODELS.findIndex(m => m.id === currentId);
  if (selected === -1) selected = 0;

  console.log(c.muted('  ↑/↓ to move, Enter to select, number to jump, Esc to keep current'));
  console.log();

  const idx = await selectFromList(MODELS, (model, isSelected, i) => renderModelRow(model, isSelected, i), selected);
  const chosen = idx === null ? MODELS[selected] : MODELS[idx];

  setSelectedModelId(chosen.id);
  console.log();
  console.log(c.success('  ✓ Selected: ') + providerBadge(chosen.provider) + ' ' + c.bold(chosen.displayName));

  if (showApiSetup) {
    const key = getApiKey(chosen.provider);
    if (!key) await promptForApiKey(chosen, sharedRl);
    else console.log(c.muted('  API key: ') + c.success('already set ✓'));
  }
  console.log();
  return chosen;
}

function renderModelRow(model, isSelected, index = 0) {
  const lines = [];
  if (index === 0 || MODELS[index].provider !== MODELS[index - 1].provider) {
    const pc = PROVIDER_COLORS[model.provider] || { bg: '#888', fg: '#fff' };
    const badge = chalk.bgHex(pc.bg).hex(pc.fg).bold(` ${model.providerLabel} `);
    lines.push('  ' + badge);
  }

  const marker = isSelected ? c.primary('❯ ') : '  ';
  const num    = c.muted(String(index + 1).padStart(2) + '. ');
  const nameStr = model.recommended
    ? model.displayName + ' ✦'
    : model.displayName;
  const name   = isSelected
    ? chalk.bold.white(nameStr).padEnd(model.recommended ? 36 : 34)
    : chalk.white(nameStr).padEnd(model.recommended ? 36 : 34);

  const tier   = TIER_COLORS[model.tier] || c.muted(model.tier);
  const speed  = c.muted(model.speed.padEnd(12));
  const stars  = c.code(model.quality);
  const ctx    = c.dim(model.context.padEnd(12));

  lines.push(`  ${marker}${num}${name} ${tier}  ${speed}  ${stars}  ${ctx}`);
  lines.push(c.muted(`        ${model.bestFor}`));
  lines.push('');
  return lines.join('\n');
}

// ─── Prompt the user for an API key for the chosen provider ──────────────────
export async function promptForApiKey(model, sharedRl = null) {
  console.log();
  console.log(c.warning('  ⚠ No API key found for ') + providerBadge(model.provider));
  console.log();
  console.log(c.muted('  Get your free key at: ') + c.info(model.apiKeyUrl));
  console.log(c.muted('  Env var:              ') + c.code(model.apiKeyEnv));
  console.log();

  const ask = (q) => sharedRl
    ? new Promise((resolve) => sharedRl.question(q, resolve))
    : new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(q, (a) => { rl.close(); resolve(a); });
      });

  const answer = await ask(c.primary('  Paste API key (or Enter to skip): '));
  const key = answer.trim();

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

// ─── Inline model switcher (used from /model command in REPL) ─────────────────
export async function inlineModelSwitcher(inputHandler) {
  inputHandler.pause();
  const chosen = await showModelPicker({
    title: 'Switch Annihilator engine',
    showApiSetup: true,
    clearScreen: false,
    sharedRl: inputHandler.rl,
  });
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
