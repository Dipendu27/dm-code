// DM Code — Terminal UI Renderer
// Exact visual replica of Claude Code's terminal interface

import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import wrapAnsi from 'wrap-ansi';
import stripAnsi from 'strip-ansi';
import os from 'os';
import { highlight } from 'cli-highlight';
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
    this.codeBuffer = '';
    this.codeLang = '';
    this.awaitingLangLine = false;
    this.inInlineCode = false;
    this.inBold = false;
    this.inThink = false;
    this.atLineStart = true; // tracks whether we're at the start of a line, for # and - detection
  }

  push(text) {
    this.buffer += text;
    let output = '';

    while (this.buffer.length > 0) {
      // ── Inside a fenced code block: buffer raw content until the closing ``` ──
      if (this.inCodeBlock) {
        if (this.awaitingLangLine) {
          const nl = this.buffer.indexOf('\n');
          if (nl === -1) {
            if (this.buffer.includes('```')) {
              // closing fence arrived with no language line in between (empty block)
              this.codeLang = '';
              this.awaitingLangLine = false;
              continue;
            }
            break; // wait for more chunks to complete the language line
          }
          this.codeLang = this.buffer.slice(0, nl).trim();
          this.buffer = this.buffer.slice(nl + 1);
          this.awaitingLangLine = false;
          continue;
        }

        const fenceIdx = this.buffer.indexOf('```');
        if (fenceIdx === -1) {
          this.codeBuffer += this.buffer;
          this.buffer = '';
          break;
        }
        this.codeBuffer += this.buffer.slice(0, fenceIdx);
        this.buffer = this.buffer.slice(fenceIdx + 3);
        this.inCodeBlock = false;
        output += renderCodeBlock(this.codeBuffer, this.codeLang);
        this.codeBuffer = '';
        this.codeLang = '';
        this.atLineStart = true;
        continue;
      }

      // ── Opening fence ──
      if (this.buffer.startsWith('```')) {
        this.inCodeBlock = true;
        this.awaitingLangLine = true;
        this.buffer = this.buffer.slice(3);
        continue;
      }

      // ── Headers: only recognized at the start of a line ──
      if (this.atLineStart) {
        const headerMatch = this.buffer.match(/^(#{1,3})\s+/);
        if (headerMatch) {
          const nl = this.buffer.indexOf('\n');
          if (nl === -1 && !this.buffer.slice(headerMatch[0].length).length) break; // wait for more
          const lineEnd = nl === -1 ? this.buffer.length : nl;
          const headerText = this.buffer.slice(headerMatch[0].length, lineEnd);
          output += '\n' + chalk.bold(c.primary(headerText)) + '\n';
          this.buffer = this.buffer.slice(lineEnd + (nl === -1 ? 0 : 1));
          this.atLineStart = true;
          continue;
        }
        const bulletMatch = this.buffer.match(/^([-*])\s+/);
        if (bulletMatch && bulletMatch[1] !== '*' || (bulletMatch && this.buffer[1] === ' ')) {
          output += c.primary('  •') + ' ';
          this.buffer = this.buffer.slice(bulletMatch[0].length);
          this.atLineStart = false;
          continue;
        }
      }

      if (this.buffer.startsWith('**')) {
        this.inBold = !this.inBold;
        this.buffer = this.buffer.slice(2);
        output += this.inBold ? '\x1b[1m' : '\x1b[22m';
        this.atLineStart = false;
      } else if (this.buffer.startsWith('`')) {
        this.inInlineCode = !this.inInlineCode;
        this.buffer = this.buffer.slice(1);
        this.atLineStart = false;
      } else if (this.buffer.startsWith('<think>')) {
        this.inThink = true;
        this.buffer = this.buffer.slice(7);
        output += '\n' + c.muted('  ┌─ ') + c.info('Backend thought') + '\n' + c.muted('  │ ');
        this.atLineStart = false;
      } else if (this.buffer.startsWith('</think>')) {
        this.inThink = false;
        this.buffer = this.buffer.slice(8);
        output += '\n' + c.muted('  └─\n');
        this.atLineStart = true;
      } else {
        const nextToken = this.buffer.match(/```|\*\*|`|<think>|<\/think>|\n/);
        const idx = nextToken ? nextToken.index : this.buffer.length;

        if (!nextToken && (this.buffer.endsWith('`') || this.buffer.endsWith('*') ||
            this.buffer.endsWith('<') || this.buffer.endsWith('</') || this.buffer.endsWith('<t'))) {
          break;
        }

        let chunk = this.buffer.slice(0, idx || 1);
        this.buffer = this.buffer.slice(chunk.length);

        if (chunk === '\n') {
          this.atLineStart = true;
          if (this.inThink) { output += '\n' + c.muted('  │ '); continue; }
          output += '\n';
          continue;
        }
        this.atLineStart = false;

        if (this.inInlineCode)    output += chalk.bgHex('#222').cyan(chunk);
        else if (this.inBold)     output += chunk;
        else if (this.inThink)    output += c.dim(chunk);
        else                      output += c.assistant(chunk);
      }
    }
    return output;
  }

  // Called at stream end in case a code block or bold span never closed
  flush() {
    let output = '';
    if (this.inCodeBlock && this.codeBuffer) {
      output += renderCodeBlock(this.codeBuffer, this.codeLang);
    } else if (this.buffer) {
      output += c.assistant(this.buffer);
    }
    return output;
  }
}

// Renders one complete fenced code block with real syntax highlighting.
// Falls back to plain text if the declared language isn't recognized —
// cli-highlight's ignoreIllegals option only covers bad syntax WITHIN a
// known language; an unrecognized language STRING still throws, so this
// try/catch is required, not optional defensive code.
function renderCodeBlock(code, lang) {
  const trimmed = code.replace(/^\n/, '').replace(/\n+$/, '');
  let highlighted;
  try {
    highlighted = lang
      ? highlight(trimmed, { language: lang, ignoreIllegals: true })
      : highlight(trimmed, { ignoreIllegals: true });
  } catch {
    highlighted = trimmed;
  }
  const label = c.dim(lang || 'code');
  const lines = highlighted.split('\n');
  const out = ['\n' + c.muted('  ┌─ ') + label];
  for (const line of lines) out.push(c.muted('  │ ') + line);
  out.push(c.muted('  └─') + '\n');
  return out.join('\n');
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
  if (activeStream) {
    const remaining = activeStream.flush();
    if (remaining) process.stdout.write(remaining);
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
  const detail = c.dim(` ${usedTokens.toLocaleString('en-US')} / ${totalTokens.toLocaleString('en-US')} tokens`);
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
    c.success(`~${saved.toLocaleString('en-US')} tokens`) +
    c.muted(` — now at ${afterTokens.toLocaleString('en-US')}`)
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
  console.log('  ' + c.muted('Input tokens:'.padEnd(18))  + c.dim(inputTokens.toLocaleString('en-US')));
  console.log('  ' + c.muted('Output tokens:'.padEnd(18)) + c.dim(outputTokens.toLocaleString('en-US')));
  console.log('  ' + c.muted('Total tokens:'.padEnd(18))  + chalk.bold((inputTokens + outputTokens).toLocaleString('en-US')));
  console.log();
}

// ─── Tool use block (Claude Code's teal/orange tool badges) ─────────────────
export function printToolCall(name, params) {
  const TOOL_VERBS = {
    read_file: 'Read', write_file: 'Write', edit_file: 'Edit',
    run_command: 'Bash', list_files: 'List', search_files: 'Search',
    create_directory: 'Mkdir', delete_file: 'Delete', move_file: 'Move',
    web_fetch: 'Fetch', memory_read: 'MemoryRead', memory_write: 'MemoryWrite',
    update_todos: 'Plan',
  };
  const verb = TOOL_VERBS[name] || name;
  const argStr = formatToolArgs(name, params);
  const dot = chalk.hex(THEME.primary)('⏺');
  console.log('  ' + dot + ' ' + chalk.bold(c.primary(verb)) + (argStr ? ' ' + c.dim(argStr) : ''));
}

export function printToolResult(name, resultStr, durationMs) {
  if (name === 'update_todos') return; // rendered separately by printTodoList
  const dot = c.muted('  └');
  const dur = durationMs !== undefined ? c.dim(` (${durationMs}ms)`) : '';
  const lines = (resultStr || '').trim().split('\n');
  if (lines.length === 1 && lines[0].length <= 80) {
    console.log(dot + ' ' + c.dim(lines[0]) + dur);
  } else {
    console.log(dot + ' ' + c.dim(`${lines.length} lines`) + dur);
  }
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

// ─── Animated Thinking Spinner ────────────────────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const THINKING_MESSAGES = [
  'Thinking…',
  'Analyzing…',
  'Cooking…',
  'Diving deep…',
  'Connecting dots…',
  'Working…',
  'Crafting answer…',
  'Almost there…',
  'Processing…',
  'Gathering info…',
  'Brainstorming…',
  'Number crunching…',
  'Assembling…',
  'Checking code…',
  'Weaving magic…',
  'Neurons firing…',
];

class ThinkingSpinner {
  constructor() {
    this._interval = null;
    this._frame = 0;
    this._msgIndex = 0;
    this._msgTick = 0;
    this._startTime = 0;
    this._overrideMsg = null;
  }

  start() {
    if (this._interval) return; // already running
    this._frame = 0;
    this._msgIndex = Math.floor(Math.random() * THINKING_MESSAGES.length);
    this._msgTick = 0;
    this._startTime = Date.now();
    this._overrideMsg = null;

    this._render();
    this._interval = setInterval(() => {
      this._frame = (this._frame + 1) % SPINNER_FRAMES.length;
      this._msgTick++;
      // Rotate message every ~25 frames (~3 seconds)
      if (this._msgTick % 25 === 0) {
        this._msgIndex = (this._msgIndex + 1) % THINKING_MESSAGES.length;
      }
      this._render();
    }, 120);
  }

  _render() {
    const spinner = chalk.hex(THEME.primary)(SPINNER_FRAMES[this._frame]);
    const msg = this._overrideMsg || THINKING_MESSAGES[this._msgIndex];
    const elapsed = ((Date.now() - this._startTime) / 1000).toFixed(0);
    const timer = c.dim(` ${elapsed}s`);
    const hint = c.dim('  (Ctrl+C to interrupt)');
    const line = `  ${spinner} ${c.muted(msg)}${timer}${hint}`;
    process.stdout.write(`\r\x1b[2K${line}`);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._overrideMsg = null;
    // Clear the spinner line
    process.stdout.write('\r\x1b[2K');
  }

  setOverrideMessage(msg) {
    this._overrideMsg = msg;
  }

  clearOverrideMessage() {
    this._overrideMsg = null;
  }

  get running() {
    return this._interval !== null;
  }
}

let _spinner = null;

export function startThinking() {
  if (!_spinner) _spinner = new ThinkingSpinner();
  _spinner.start();
}

export function stopThinking() {
  if (_spinner) _spinner.stop();
}

export function setThinkingMessage(msg) {
  if (_spinner) _spinner.setOverrideMessage(msg);
}

export function clearThinkingMessage() {
  if (_spinner) _spinner.clearOverrideMessage();
}

// Legacy aliases for backward compat
export function printThinking(msg) {
  startThinking();
}

export function clearThinking() {
  stopThinking();
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
    c.dim(`in ${inputTokens.toLocaleString('en-US')}`),
    c.muted(' / '),
    c.dim(`out ${outputTokens.toLocaleString('en-US')}`),
  ];
  if (cacheReadTokens > 0) {
    parts.push(c.muted(' / '), c.dim(`cache ${cacheReadTokens.toLocaleString('en-US')}`));
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
      c.dim(`${s.turns} turns, ${s.tokens.toLocaleString('en-US')} tokens`) + '  ' +
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
    case 'update_todos':      return `${Array.isArray(params.todos) ? params.todos.length : 0} item(s)`;
    default:                  return JSON.stringify(params).slice(0, 80);
  }
}

function truncateResult(result) {
  if (!result) return '';
  const s = typeof result === 'string' ? result : JSON.stringify(result);
  const clean = s.replace(/\n+/g, ' ').trim();
  return clean.length > 120 ? clean.slice(0, 120) + '…' : clean;
}

export function printTodoList(todos) {
  if (!todos || todos.length === 0) return;
  console.log();
  for (const t of todos) {
    if (t.status === 'completed') {
      console.log('  ' + c.success('✓') + ' ' + c.dim(chalk.strikethrough(t.content)));
    } else if (t.status === 'in_progress') {
      console.log('  ' + c.primary('◐') + ' ' + chalk.bold(c.primary(t.content)));
    } else {
      console.log('  ' + c.muted('○') + ' ' + c.muted(t.content));
    }
  }
  console.log();
}
