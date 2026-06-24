// DM Code — Terminal UI Renderer
// Exact visual replica of Claude Code's terminal interface

import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import wrapAnsi from 'wrap-ansi';
import stripAnsi from 'strip-ansi';
import os from 'os';
import { TOOL_NAME, MODEL_DISPLAY, TOOL_VERSION, THEME } from '../config/constants.js';

// ─── Color helpers ───────────────────────────────────────────────────────────
const c = {
  primary:   (t) => chalk.hex(THEME.primary)(t),
  secondary: (t) => chalk.hex(THEME.secondary)(t),
  success:   (t) => chalk.hex(THEME.success)(t),
  error:     (t) => chalk.hex(THEME.error)(t),
  warning:   (t) => chalk.hex(THEME.warning)(t),
  info:      (t) => chalk.hex(THEME.info)(t),
  muted:     (t) => chalk.hex(THEME.muted)(t),
  code:      (t) => chalk.hex(THEME.code)(t),
  tool:      (t) => chalk.hex(THEME.tool)(t),
  user:      (t) => chalk.white.bold(t),
  assistant: (t) => chalk.hex(THEME.assistant)(t),
  dim:       (t) => chalk.dim(t),
  bold:      (t) => chalk.bold(t),
  italic:    (t) => chalk.italic(t),
};

// Terminal width with sensible fallback
function termWidth() {
  return Math.min(process.stdout.columns || 100, 120);
}

// ─── Welcome Banner ──────────────────────────────────────────────────────────
export function printWelcome() {
  const width = termWidth();

  // DM Code gradient banner — exact Claude Code aesthetic
  const banner = gradient(['#CC785C', '#E8956D', '#F5A882'])(`
  ██████╗ ███╗   ███╗     ██████╗ ██████╗ ██████╗ ███████╗
  ██╔══██╗████╗ ████║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
  ██║  ██║██╔████╔██║    ██║     ██║   ██║██║  ██║█████╗  
  ██║  ██║██║╚██╔╝██║    ██║     ██║   ██║██║  ██║██╔══╝  
  ██████╔╝██║ ╚═╝ ██║    ╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═╝     ╚═╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝`);

  console.log(banner);
  console.log();
  const platformLabel = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' }[process.platform] || process.platform;
  console.log(
    c.muted('  ') +
    c.primary(`${TOOL_NAME} v${TOOL_VERSION}`) +
    c.muted(' — powered by ') +
    c.code(MODEL_DISPLAY) +
    c.muted(` — ${platformLabel} (${process.arch})`)
  );
  console.log(
    c.muted('  Type ') +
    c.bold('/help') +
    c.muted(' for commands, ') +
    c.bold('Ctrl+C') +
    c.muted(' to exit')
  );
  console.log(c.muted('  ' + '─'.repeat(width - 4)));
  console.log();
}

// ─── Session line (like Claude Code's top bar) ───────────────────────────────
export function printSessionLine(cwd, model = MODEL_DISPLAY) {
  const short = cwd.replace(os.homedir(), '~');
  const left  = c.muted('  ◆ ') + c.primary(model);
  const right = c.muted(short);
  const pad   = termWidth() - stripAnsi(left).length - stripAnsi(right).length - 2;
  const spacer = pad > 0 ? ' '.repeat(pad) : ' ';
  console.log(left + spacer + right);
  console.log(c.muted('  ' + '─'.repeat(termWidth() - 4)));
}

// ─── User message prefix (exact Claude Code style) ──────────────────────────
export function printUserPrompt(text) {
  console.log();
  const prefix = chalk.bgHex(THEME.primary).black(' you ') + ' ';
  console.log(prefix + c.user(text));
  console.log();
}

// ─── Assistant response prefix ───────────────────────────────────────────────
export function printAssistantPrefix() {
  const prefix = chalk.bgHex('#2A2A2A').hex(THEME.primary)(' annihilator ') + ' ';
  process.stdout.write(prefix + ' ');
}

// ─── Streaming text output (Fix 3.3 & 3.12) ───────────────────────────────────
class StreamingMarkdown {
  constructor() {
    this.buffer = '';
    this.inCodeBlock = false;
    this.inInlineCode = false;
    this.inBold = false;
  }

  push(text) {
    this.buffer += text;
    let output = '';

    // Process complete tokens while they exist in the buffer
    while (this.buffer.length > 0) {
      if (this.buffer.startsWith('```')) {
        this.inCodeBlock = !this.inCodeBlock;
        this.buffer = this.buffer.slice(3);
        // Code block formatting
        output += this.inCodeBlock ? chalk.bgHex('#1A1A1A').hex('#A8C7FA')('\n') : chalk.reset('\n');
      } else if (this.buffer.startsWith('**')) {
        this.inBold = !this.inBold;
        this.buffer = this.buffer.slice(2);
        output += this.inBold ? '\x1b[1m' : '\x1b[22m';
      } else if (this.buffer.startsWith('`') && !this.inCodeBlock) {
        this.inInlineCode = !this.inInlineCode;
        this.buffer = this.buffer.slice(1);
        output += this.inInlineCode ? chalk.bgHex('#222').cyan('') : chalk.reset(c.assistant(''));
      } else {
        // Find next potential token
        const nextToken = this.buffer.match(/```|\*\*|`/);
        const idx = nextToken ? nextToken.index : this.buffer.length;

        // If a token is partially formed at the end, wait for more chunks
        if (!nextToken && (this.buffer.endsWith('`') || this.buffer.endsWith('*'))) {
          break; // wait for next chunk
        }

        const chunk = this.buffer.slice(0, idx || 1);
        this.buffer = this.buffer.slice(chunk.length);

        // Apply formatting
        if (this.inCodeBlock) {
          output += chalk.bgHex('#1A1A1A').hex('#A8C7FA')(chunk);
        } else if (this.inInlineCode) {
          output += chalk.bgHex('#222').cyan(chunk);
        } else if (this.inBold) {
          output += chunk; // ANSI bold is active
        } else {
          output += c.assistant(chunk);
        }
      }
    }
    return output;
  }
}

let activeStream = null;

export function printStreamChunk(text) {
  if (!activeStream) activeStream = new StreamingMarkdown();
  const formatted = activeStream.push(text);
  if (formatted) {
    process.stdout.write(formatted);
  }
}

// ─── End streaming ───────────────────────────────────────────────────────────
export function printStreamEnd() {
  if (activeStream && activeStream.buffer) {
    process.stdout.write(c.assistant(activeStream.buffer));
  }
  activeStream = null;
  console.log();
  console.log();
}

// ─── Context window usage bar (Fix 2) ─────────────────────────────────────────
export function renderContextBar(usedTokens, totalTokens) {
  if (!totalTokens || totalTokens <= 0) return;
  const pct = Math.min(Math.round((usedTokens / totalTokens) * 100), 100);
  const barLen = 20;
  const filled = Math.floor(pct / (100 / barLen));
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

  let color;
  if (pct > 70)      color = '\x1b[33m';  // yellow
  else if (pct > 50) color = '\x1b[36m';  // cyan
  else               color = '\x1b[32m';  // green

  const reset = '\x1b[0m';
  const label = `${color}[ctx ${bar} ${pct}%]${reset}`;
  const detail = c.dim(` ${usedTokens.toLocaleString()} / ${totalTokens.toLocaleString()} tokens`);
  console.log(`  ${label}${detail}`);
}

// ─── Compact notification ─────────────────────────────────────────────────────
export function printCompactNotice(reason, beforeTokens, afterTokens) {
  const saved = beforeTokens - afterTokens;
  console.log();
  console.log(
    c.info('  ⟲ ') +
    chalk.bold('Context compacted') +
    c.muted(` (${reason})`)
  );
  console.log(
    c.muted('    Freed ') +
    c.success(`~${saved.toLocaleString()} tokens`) +
    c.muted(` — now at ${afterTokens.toLocaleString()}`)
  );
  console.log();
}

// ─── Cost / token spend display ───────────────────────────────────────────────
export function printCostSummary(inputTokens, outputTokens, modelName, sessionTurns) {
  console.log();
  console.log(c.bold('  Token Usage Summary'));
  console.log(c.muted('  ' + '─'.repeat(44)));
  console.log('  ' + c.muted('Model:'.padEnd(18))    + c.code(modelName));
  console.log('  ' + c.muted('Turns:'.padEnd(18))    + c.code(String(sessionTurns)));
  console.log('  ' + c.muted('Input tokens:'.padEnd(18))  + c.dim(inputTokens.toLocaleString()));
  console.log('  ' + c.muted('Output tokens:'.padEnd(18)) + c.dim(outputTokens.toLocaleString()));
  console.log('  ' + c.muted('Total tokens:'.padEnd(18))  + chalk.bold((inputTokens + outputTokens).toLocaleString()));
  console.log();
}

// ─── Tool use block (Claude Code's teal/orange tool badges) ─────────────────
export function printToolCall(toolName, params) {
  const icon = toolIcon(toolName);
  const label = chalk.bgHex('#1C2333').hex(THEME.tool)(` ${icon} ${toolName} `);
  const args  = formatToolArgs(toolName, params);
  console.log(c.muted('  ') + label + ' ' + c.dim(args));
}

export function printToolResult(toolName, result, durationMs) {
  const dur = durationMs ? c.muted(` (${durationMs}ms)`) : '';
  const icon = '✓';
  const snippet = truncateResult(result);
  console.log(
    c.muted('  ') +
    c.success(`${icon} ${toolName}`) +
    dur +
    (snippet ? '\n  ' + c.dim(snippet) : '')
  );
}

export function printToolError(toolName, error) {
  const msg = typeof error === 'string' ? error : error?.message || String(error);
  console.log(
    c.muted('  ') +
    c.error(`✗ ${toolName}: `) +
    c.dim(msg.slice(0, 120))
  );
}

// ─── Confirmation prompt (exact Claude Code style) ───────────────────────────
export function printConfirmBox(action, details) {
  const lines = [
    chalk.bold(action),
    '',
    ...details.map(d => c.muted('  ') + d),
    '',
    c.muted('  Press ') + chalk.bold.green('y') + c.muted(' to approve, ') +
    chalk.bold.red('n') + c.muted(' to reject, ') +
    chalk.bold.yellow('a') + c.muted(' to approve all'),
  ];
  const box = boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: 'round',
    borderColor: 'yellow',
    width: Math.min(termWidth() - 4, 100),
  });
  console.log('\n' + box.split('\n').map(l => '  ' + l).join('\n'));
}

// ─── Diff viewer (file edits) — Enhanced with unified format (Fix 3) ─────────
export function printDiff(oldText, newText, filepath) {
  console.log();
  console.log(c.muted('  ┌─ ') + c.info('Diff Preview: ') + chalk.bold(filepath));
  console.log(chalk.red(`  │ --- ${filepath}`) + c.dim(' (before)'));
  console.log(chalk.green(`  │ +++ ${filepath}`) + c.dim(' (after)'));
  console.log(c.muted('  │'));

  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  // Compute a simple line-level diff with context
  const maxLines = Math.max(oldLines.length, newLines.length);
  let shown = 0;
  let unchanged = 0;
  const CONTEXT = 3;  // lines of context around changes
  const pendingContext = [];

  for (let i = 0; i < maxLines && shown < 60; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    const lineNum = String(i + 1).padStart(4);

    if (o === n) {
      unchanged++;
      pendingContext.push({ lineNum, text: o || '' });
      if (pendingContext.length > CONTEXT) pendingContext.shift();
    } else {
      // Print pending context lines before the change
      if (unchanged > CONTEXT && shown > 0) {
        console.log(c.muted(`  │ ${' '.repeat(4)}  ⋮ ${unchanged - pendingContext.length} unchanged lines`));
      }
      for (const ctx of pendingContext) {
        console.log(c.muted(`  │ ${ctx.lineNum}   ${ctx.text.slice(0, 90)}`));
      }
      pendingContext.length = 0;
      unchanged = 0;

      if (o !== undefined) {
        console.log(chalk.red(`  │ ${lineNum} - ${(o || '').slice(0, 90)}`));
      }
      if (n !== undefined) {
        console.log(chalk.green(`  │ ${lineNum} + ${(n || '').slice(0, 90)}`));
      }
      shown++;
    }
  }

  if (shown === 0) {
    console.log(c.muted('  │   (no changes)'));
  } else if (maxLines > 60) {
    console.log(c.muted(`  │   ... ${maxLines - 60} more lines`));
  }

  const addedCount = newLines.length - oldLines.length;
  const summary = addedCount >= 0
    ? c.success(`+${addedCount} lines`)
    : c.error(`${addedCount} lines`);
  console.log(c.muted('  │'));
  console.log(c.muted('  │ ') + c.dim('Summary: ') + summary);
  console.log(c.muted('  └─'));
  console.log();
}

// ─── Command output block ─────────────────────────────────────────────────────
export function printCommandOutput(cmd, stdout, stderr, exitCode) {
  const statusIcon = exitCode === 0 ? c.success('✓') : c.error('✗');
  console.log(c.muted('  ┌─ ') + c.code(`$ ${cmd}`) + ' ' + statusIcon);

  const lines = (stdout + (stderr ? '\n' + chalk.red(stderr) : '')).split('\n');
  const trimmed = lines.filter(l => l.trim()).slice(0, 30);

  for (const line of trimmed) {
    console.log(c.muted('  │ ') + c.dim(line.slice(0, termWidth() - 6)));
  }

  if (lines.length > 30) {
    console.log(c.muted(`  │ ... ${lines.length - 30} more lines`));
  }
  console.log(c.muted('  └─'));
}

// ─── Thinking / spinner message ───────────────────────────────────────────────
export function printThinking(msg = 'Annihilator is thinking…') {
  process.stdout.write(c.muted(`  ◌ ${msg}`));
}

export function clearThinking() {
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
}

// ─── Info / status messages ───────────────────────────────────────────────────
export function printInfo(msg) {
  console.log(c.info('  ℹ ') + c.muted(msg));
}

export function printSuccess(msg) {
  console.log(c.success('  ✓ ') + msg);
}

export function printError(msg) {
  console.log(c.error('  ✗ ') + chalk.red(msg));
}

export function printWarning(msg) {
  console.log(c.warning('  ⚠ ') + chalk.yellow(msg));
}

// ─── Help panel ───────────────────────────────────────────────────────────────
export function printHelp() {
  const commands = [
    ['/help, /h',        'Show this help'],
    ['/model, /m',       'Switch model engine interactively'],
    ['/models',          'List all available models'],
    ['/keys',            'Show API key status for all providers'],
    ['/keys set P KEY',  'Save an API key for a provider'],
    ['/keys clear P',    'Remove a key for a provider'],
    ['/clear, /c',       'Clear screen and conversation'],
    ['/reset, /r',       'Reset conversation history only'],
    ['/compact [text]',  'Compact conversation to free context window'],
    ['/cost',            'Show running token spend for this session'],
    ['/config',          'Show current configuration'],
    ['/config set K V',  'Set a config value'],
    ['/approve-all',     'Toggle auto-approve for tool calls'],
    ['/verbose',         'Toggle verbose tool output'],
    ['/memory',          'Show session memory entries'],
    ['/cwd',             'Show current working directory'],
    ['/cd <path>',       'Change working directory'],
    ['/sessions',        'List all saved sessions'],
    ['/resume <id>',     'Resume a previously saved session'],
    ['/save',            'Export session to Markdown (default: dm-session-<timestamp>.md)'],
    ['/save <filename>', 'Export session to a specific filename or path'],
    ['/exit, /quit',     'Exit DM Code'],
    ['',                 ''],
    ['Keyboard shortcuts:', ''],
    ['Ctrl+C',           'Cancel current operation or exit'],
    ['Ctrl+L',           'Clear screen'],
    ['↑/↓ arrows',       'Navigate input history'],
  ];

  console.log();
  const title = chalk.bold.hex(THEME.primary)('DM Code Commands');
  console.log('  ' + title);
  console.log(c.muted('  ' + '─'.repeat(50)));

  for (const [cmd, desc] of commands) {
    if (!cmd && !desc) { console.log(); continue; }
    if (!desc) {
      console.log(c.muted('  ' + cmd));
      continue;
    }
    const padded = cmd.padEnd(22);
    console.log('  ' + c.primary(padded) + c.muted(desc));
  }
  console.log();
}

// ─── Config display ───────────────────────────────────────────────────────────
export function printConfig(cfg) {
  console.log();
  console.log(c.bold('  Configuration'));
  console.log(c.muted('  ' + '─'.repeat(40)));
  for (const [k, v] of Object.entries(cfg)) {
    const val = k === 'apiKey'
      ? (v ? c.success('●●●● set') : c.error('not set'))
      : c.code(String(v));
    console.log('  ' + c.muted(k.padEnd(28)) + val);
  }
  console.log();
}

// ─── Token usage (shown after each response) ─────────────────────────────────
export function printTokenUsage(inputTokens, outputTokens, cacheReadTokens = 0) {
  const total = inputTokens + outputTokens;
  const parts = [
    c.muted('  tokens: '),
    c.dim(`in ${inputTokens.toLocaleString()}`),
    c.muted(' / '),
    c.dim(`out ${outputTokens.toLocaleString()}`),
  ];
  if (cacheReadTokens > 0) {
    parts.push(c.muted(' / '), c.dim(`cache ${cacheReadTokens.toLocaleString()}`));
  }
  console.log(parts.join(''));
}

// ─── Session list display (Fix 5) ─────────────────────────────────────────────
export function printSessionList(sessions) {
  if (sessions.length === 0) {
    printInfo('No saved sessions found.');
    return;
  }
  console.log();
  console.log(c.bold('  Saved Sessions'));
  console.log(c.muted('  ' + '─'.repeat(70)));

  for (let i = 0; i < sessions.length && i < 20; i++) {
    const s = sessions[i];
    const age = _timeAgo(s.savedAt);
    const statusIcon = s.status === 'active'
      ? c.warning('● crashed')
      : c.success('✓ completed');
    const shortCwd = (s.cwd || '').replace(process.env.HOME || '', '~');

    console.log(
      `  ${chalk.bold(String(i + 1).padStart(2))}. ` +
      statusIcon + '  ' +
      c.code(shortCwd) + '  ' +
      c.dim(`${s.turns} turns, ${s.tokens.toLocaleString()} tokens`) + '  ' +
      c.muted(age)
    );
    console.log(c.dim(`      ID: ${s.id}  Model: ${s.modelId || 'unknown'}`));
  }

  if (sessions.length > 20) {
    console.log(c.muted(`  ... and ${sessions.length - 20} more`));
  }
  console.log();
}

function _timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Ollama fallback notice ───────────────────────────────────────────────────
export function printOllamaFallback(reason) {
  console.log();
  console.log(
    c.warning('  ⚠ ') +
    chalk.bold.yellow('API limit hit') +
    c.muted(' — switching to local Ollama model')
  );
  if (reason) console.log(c.dim(`    Reason: ${reason}`));
  console.log(c.dim('    Session continues with reduced capability.'));
  console.log();
}

// ─── File list display ────────────────────────────────────────────────────────
export function printFileList(files, title = 'Files') {
  console.log(c.muted(`  ┌─ ${title}`));
  for (const f of files.slice(0, 50)) {
    console.log(c.muted('  │ ') + c.dim(f));
  }
  if (files.length > 50) {
    console.log(c.muted(`  │ ... and ${files.length - 50} more`));
  }
  console.log(c.muted('  └─'));
}

// (Cost estimate removed — misleading for free-tier models)

// ─── Horizontal rule ──────────────────────────────────────────────────────────
export function printHR() {
  console.log(c.muted('  ' + '─'.repeat(termWidth() - 4)));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function toolIcon(name) {
  const icons = {
    read_file:         '📄',
    write_file:        '✏️',
    edit_file:         '📝',
    run_command:       '⚡',
    list_files:        '📁',
    search_files:      '🔍',
    create_directory:  '📂',
    delete_file:       '🗑',
    move_file:         '📦',
    web_fetch:         '🌐',
    memory_read:       '🧠',
    memory_write:      '🧠',
  };
  return icons[name] || '🔧';
}

function formatToolArgs(toolName, params) {
  if (!params) return '';
  switch (toolName) {
    case 'read_file':         return params.path || '';
    case 'write_file':        return params.path || '';
    case 'edit_file':         return params.path || '';
    case 'run_command':       return (params.command || '').slice(0, 80);
    case 'list_files':        return params.path || '.';
    case 'search_files':      return `"${params.pattern || ''}" in ${params.path || '.'}`;
    case 'create_directory':  return params.path || '';
    case 'delete_file':       return params.path || '';
    case 'move_file':         return `${params.source} → ${params.destination}`;
    case 'web_fetch':         return (params.url || '').slice(0, 80);
    case 'memory_read':       return params.key || '';
    case 'memory_write':      return params.key || '';
    default:                  return JSON.stringify(params).slice(0, 80);
  }
}

function truncateResult(result) {
  if (!result) return '';
  const s = typeof result === 'string' ? result : JSON.stringify(result);
  const clean = s.replace(/\n+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 120) + '…' : clean;
}
