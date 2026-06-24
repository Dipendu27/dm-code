// DM Code — Input Handler
// Readline-based REPL with history, shortcuts, multi-line support

import readline from 'readline';
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
  }

  // ── Bootstrap the readline interface ────────────────────────────────────────
  start({ onLine, onClose, onInterrupt }) {
    this._onLine = onLine;
    this._onClose = onClose;

    this.rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: HISTORY_MAX,
      prompt: PROMPT,
      removeHistoryDuplicates: true,
    });

    // Ctrl+C — cancel current op or exit
    this.rl.on('SIGINT', () => {
      if (onInterrupt) onInterrupt();
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        this.history.unshift(trimmed);
        if (this.history.length > HISTORY_MAX) this.history.pop();
      }
      if (this._onLine) this._onLine(trimmed);
    });

    this.rl.on('close', () => {
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

  // ── Pause/resume (used while streaming) ─────────────────────────────────────
  pause() {
    if (this.rl) this.rl.pause();
  }

  resume() {
    if (this.rl) {
      this.rl.resume();
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
