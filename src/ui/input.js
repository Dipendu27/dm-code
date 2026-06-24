// DM Code — Input Handler
// Readline-based REPL with history, shortcuts, multi-line support

import readline from 'readline';
import { StringDecoder } from 'string_decoder';
import chalk from 'chalk';
import { THEME } from '../config/constants.js';

const PROMPT = chalk.hex(THEME.primary).bold('❯ ');
const HISTORY_MAX = 100;

export class InputHandler {
  constructor() {
    this.history = [];
    this.historyIndex = -1;
    this.currentInput = '';
    this.rl = null;
    this._onLine = null;
    this._onClose = null;
    this._onInterrupt = null;
    this._paused = false;
  }

  // ── Bootstrap the readline interface ────────────────────────────────────────
  start({ onLine, onClose, onInterrupt }) {
    this._onLine = onLine;
    this._onClose = onClose;
    this._onInterrupt = onInterrupt;

    // Fix 4.6: CJK mojibake (use StringDecoder to prevent splitting multi-byte chars)
    const decoder = new StringDecoder('utf8');
    
    // Fix 4.2: Bracketed paste duplication in VS Code / Cursor
    let inBracketedPaste = false;
    const rawStdin = process.stdin;
    
    // Enable bracketed paste in the terminal
    process.stdout.write('\x1b[?2004h');

    // Intercept stdin to filter out bracketed paste markers which cause duplication/bugs
    const handleData = (chunk) => {
      let text = decoder.write(chunk);
      
      if (text.includes('\x1b[200~')) {
        inBracketedPaste = true;
        text = text.replace(/\x1b\[200~/g, '');
      }
      
      if (text.includes('\x1b[201~')) {
        inBracketedPaste = false;
        text = text.replace(/\x1b\[201~/g, '');
      }
    };
    
    rawStdin.on('data', handleData);

    this.rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: HISTORY_MAX,
      prompt: PROMPT,
      removeHistoryDuplicates: true,
      escapeCodeTimeout: 50, // Helps with fast bracketed paste sequences
    });

    // Ctrl+C — fires even while processing because we no longer pause readline
    // Both handlers exist for cross-platform reliability, but we debounce to
    // prevent double-firing when both trigger from the same Ctrl+C press.
    let lastInterrupt = 0;
    const handleInterrupt = () => {
      const now = Date.now();
      if (now - lastInterrupt < 200) return; // debounce duplicate SIGINT
      lastInterrupt = now;
      if (this._onInterrupt) this._onInterrupt();
    };

    this.rl.on('SIGINT', handleInterrupt);

    // Belt-and-suspenders: process-level SIGINT for Windows terminals
    // where readline's SIGINT may not fire in some edge cases
    process.on('SIGINT', handleInterrupt);

    this.rl.on('line', (line) => {
      // Discard any input while the agent is processing
      if (this._paused) return;

      const trimmed = line.trim();
      if (trimmed) {
        this.history.unshift(trimmed);
        if (this.history.length > HISTORY_MAX) this.history.pop();
      }
      if (this._onLine) this._onLine(trimmed);
    });

    this.rl.on('close', () => {
      // Disable bracketed paste
      process.stdout.write('\x1b[?2004l');
      if (this._onClose) this._onClose();
    });

    this.rl.prompt();
  }

  // ── Show prompt again after output ──────────────────────────────────────────
  prompt() {
    if (this.rl) {
      this.rl.prompt();
    }
  }

  // ── Pause/resume (used while agent is processing) ───────────────────────────
  // IMPORTANT: We do NOT call this.rl.pause() anymore.
  // Pausing readline kills stdin reading, which makes Ctrl+C undetectable.
  // Instead, we mute the prompt and discard line events via the _paused flag.
  pause() {
    this._paused = true;
    // Hide the prompt cursor and suppress echo during processing
    if (this.rl) {
      this.rl.setPrompt('');
    }
  }

  resume() {
    this._paused = false;
    if (this.rl) {
      this.rl.setPrompt(PROMPT);
      this.rl.prompt();
    }
  }

  // ── One-shot question (y/n/a confirmations) ──────────────────────────────────
  question(q) {
    return new Promise((resolve) => {
      if (!this.rl) { resolve(''); return; }
      this.rl.question(q, resolve);
    });
  }

  // ── Close cleanly ────────────────────────────────────────────────────────────
  close() {
    if (this.rl) {
      process.stdout.write('\x1b[?2004l'); // Disable bracketed paste
      this.rl.close();
      this.rl = null;
    }
  }
}

// ── Single-shot confirm helper ─────────────────────────────────────────────────
export async function confirm(rl, message) {
  return new Promise((resolve) => {
    rl.question(
      chalk.yellow(`  ${message} `) + chalk.dim('[y/n/a] '),
      (answer) => {
        const a = answer.trim().toLowerCase();
        resolve({ approved: a === 'y' || a === 'yes', all: a === 'a' });
      }
    );
  });
}
