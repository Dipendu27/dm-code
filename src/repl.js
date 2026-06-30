// DM Code — Main REPL (multi-provider edition)

import chalk from 'chalk';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { InputHandler }      from './ui/input.js';
import { AgentLoop }         from './agent/loop.js';
import { showModelPicker, inlineModelSwitcher, printCurrentModel, providerBadge } from './ui/model-picker.js';
import {
  printWelcome, printSessionLine, printUserPrompt, printHelp,
  printConfig, printConfirmBox, printInfo, printSuccess, printError, printWarning,
  printCostSummary, printSessionList, stopThinking,
} from './ui/renderer.js';
import {
  getApiKey, setApiKey, getAllConfig, getConfig, setConfig,
  getSelectedModelId, setSelectedModelId, isFirstRun, markFirstRunDone,
  loadDotenvFrom,
} from './config/settings.js';
import { TOOL_NAME, MODEL_DISPLAY, MODELS, getModelById } from './config/constants.js';
import { SessionPersistence } from './agent/session.js';

export class REPL {
  constructor(options = {}) {
    this.options     = options;
    this.cwd         = options.cwd || process.cwd();
    this.memory      = {};
    this.autoApprove = options.autoApprove || false;
    this.verbose     = options.verbose     || false;
    this.resumeSessionId = options.resumeSessionId || null;
    this.agent       = null;
    this.input       = new InputHandler();
    this.processing  = false;
    this._pendingExit = false;
    this._memoryFile = path.join(this.cwd, '.dmcode-memory.json');
  }

  async start() {
    // Load .env from the actual working directory (may differ from process.cwd() with --cwd)
    loadDotenvFrom(this.cwd);

    // First-run: show model picker and API key setup
    if (isFirstRun()) {
      await showModelPicker({ title: 'Welcome to DM Code — Choose your Annihilator engine', showApiSetup: true });
      markFirstRunDone();
    } else {
      // Verify API key for current model is set
      const modelId = getSelectedModelId();
      const model   = getModelById(modelId);
      const key     = getApiKey(model.provider);
      if (!key) {
        console.log();
        printWarning(`No API key for ${model.providerLabel}. Let's fix that.`);
        const { promptForApiKey } = await import('./ui/model-picker.js');
        await promptForApiKey(model);
      }
    }

    printWelcome();
    printSessionLine(this.cwd, MODEL_DISPLAY);
    printCurrentModel();
    console.log();

    // Load persistent memory
    await this._loadMemory();

    this._initAgent();

    // Show session ID so user can /resume it later
    printInfo(`Session ID: ${chalk.bold(this.agent.getSessionId())}  (use /resume <id> to restore)`);
    console.log();

    // Resume session if requested
    if (this.resumeSessionId) {
      const restored = await this.agent.restoreSession(this.resumeSessionId);
      if (restored) {
        printSuccess(`Resumed session ${this.resumeSessionId}`);
      }
    }

    // Clean up old sessions on startup (async, non-blocking)
    SessionPersistence.cleanupOldSessions(30).catch(() => {});

    this.input.start({
      onLine:      (line) => this._handleLine(line),
      onClose:     ()     => this._exit(),
      onInterrupt: ()     => this._handleInterrupt(),
    });
  }

  _initAgent() {
    this.agent = new AgentLoop({
      cwd:         this.cwd,
      autoApprove: this.autoApprove,
      verbose:     this.verbose,
      memoryRef:   this.memory,
      onConfirm:   (toolName, params) => this._confirmTool(toolName, params),
    });
  }

  async _handleLine(line) {
    if (!line) { this.input.prompt(); return; }

    // Reset pending-exit flag on any new input
    this._pendingExit = false;

    // Bare exit / quit without slash
    const lower = line.toLowerCase();
    if (lower === 'exit' || lower === 'quit' || lower === 'q') {
      this._exit();
      return;
    }

    if (line.startsWith('/')) {
      await this._handleCommand(line);
      this.input.prompt();
      return;
    }

    this.input.pause();
    this.processing = true;
    try {
      printUserPrompt(line);
      await this.agent.run(line);
    } catch (err) {
      printError(err.message);
    } finally {
      this.processing = false;
      await this._saveMemory();
      this.input.resume();
    }
  }

  async _handleCommand(line) {
    const [cmd, ...rest] = line.slice(1).split(' ');
    const arg = rest.join(' ').trim();

    switch (cmd.toLowerCase()) {
      case 'help': case 'h':
        printHelp();
        break;

      case 'model': case 'm':
        await this._switchModel();
        break;

      case 'models':
        this._listModels();
        break;

      case 'keys':
        await this._handleKeysCommand(rest);
        break;

      case 'clear': case 'c':
        console.clear();
        printWelcome();
        printSessionLine(this.cwd, MODEL_DISPLAY);
        printCurrentModel();
        this.agent?.resetHistory();
        printInfo('Screen cleared, conversation reset.');
        break;

      case 'reset': case 'r':
        this.agent?.resetHistory();
        printSuccess('Conversation history cleared.');
        break;

      case 'config':
        await this._handleConfigCommand(rest);
        break;

      case 'approve-all':
        this.autoApprove = !this.autoApprove;
        this.agent?.setAutoApprove(this.autoApprove);
        printInfo(`Auto-approve: ${this.autoApprove ? chalk.green('ON') : chalk.red('OFF')}`);
        break;

      case 'verbose':
        this.verbose = !this.verbose;
        if (this.agent) this.agent.verbose = this.verbose;
        printInfo(`Verbose: ${this.verbose ? chalk.green('ON') : chalk.red('OFF')}`);
        break;

      case 'memory':
        this._showMemory();
        break;

      case 'cwd':
        printInfo(`Working directory: ${this.cwd}`);
        break;

      case 'cd':
        await this._changeDirectory(arg);
        break;

      case 'compact':
        await this._compact(arg);
        break;

      case 'cost':
        this._showCost();
        break;

      case 'resume':
        await this._resumeSession(arg);
        break;

      case 'sessions':
        await this._listSessions();
        break;

      case 'save':
        await this._handleSave(arg || null);
        break;

      case 'undo':
        await this._handleUndo();
        break;

      case 'session':
        printInfo(`Session ID: ${chalk.bold(this.agent?.getSessionId() || 'none')}`);
        break;

      case 'exit': case 'quit': case 'q':
        this._exit();
        break;

      default:
        printWarning(`Unknown command: /${cmd}. Type /help for commands.`);
    }
  }

  // ── /model ────────────────────────────────────────────────────────────────
  async _switchModel() {
    this.input.pause();
    try {
      const chosen = await inlineModelSwitcher(this.input);
      console.log();
      printSuccess(`Engine switched to ${chalk.bold(chosen.displayName)}.`);
      printCurrentModel();
    } finally {
      this.input.resume();
    }
  }

  // ── /models ───────────────────────────────────────────────────────────────
  _listModels() {
    console.log();
    console.log(chalk.bold('  Available Models'));
    console.log(chalk.dim('  ' + '─'.repeat(62)));
    for (const m of MODELS) {
      const current = m.id === getSelectedModelId();
      const marker  = current ? chalk.green(' ◆ ') : '   ';
      const badge   = providerBadge(m.provider);
      const name    = current ? chalk.bold.white(m.displayName) : chalk.dim(m.displayName);
      console.log(`${marker}${badge} ${name}  ${chalk.dim(m.quality + '  ' + m.speed)}`);
    }
    console.log();
    console.log(chalk.dim('  Use /model to switch interactively.'));
    console.log();
  }

  // ── /keys ─────────────────────────────────────────────────────────────────
  async _handleKeysCommand(args) {
    if (args.length === 0 || args[0] === 'list') {
      console.log();
      console.log(chalk.bold('  API Keys'));
      console.log(chalk.dim('  ' + '─'.repeat(50)));
      const providers = ['anthropic', 'google', 'groq', 'mistral'];
      for (const p of providers) {
        const key = getApiKey(p);
        const status = key
          ? chalk.green('●●●● set') + chalk.dim(` (${key.slice(0, 12)}…)`)
          : chalk.red('not set');
        const badge = providerBadge(p);
        console.log(`  ${badge} ${status}`);
        const model = MODELS.find(m => m.provider === p);
        if (model) console.log(chalk.dim(`       Set with: dmcode keys set ${p} YOUR_KEY  |  ${model.apiKeyUrl}`));
        console.log();
      }
      return;
    }

    if (args[0] === 'set' && args[1]) {
      const provider = args[1].toLowerCase();
      const validProviders = ['anthropic', 'google', 'groq', 'mistral'];
      if (!validProviders.includes(provider)) {
        printError(`Unknown provider: ${provider}. Use: anthropic | google | groq | mistral`);
        return;
      }

      let key = args[2] || '';

      // If no key provided inline, prompt interactively (keeps key out of shell history)
      if (!key) {
        const model = MODELS.find(m => m.provider === provider);
        if (model) {
          console.log();
          printInfo(`Get your free key at: ${model.apiKeyUrl}`);
        }
        key = await new Promise((resolve) => {
          this.input.rl.question(chalk.hex('#CC785C')(`  Paste ${provider} API key: `), (answer) => {
            resolve(answer.trim());
          });
        });
      }

      if (!key) {
        printWarning('No key entered. Skipped.');
        return;
      }

      setApiKey(provider, key);
      this._initAgent();
      printSuccess(`API key saved for ${providerBadge(provider)}`);
      return;
    }

    if (args[0] === 'clear' && args[1]) {
      setApiKey(args[1], '');
      printSuccess(`Cleared key for ${args[1]}.`);
      return;
    }

    printWarning('Usage: /keys [list | set PROVIDER KEY | clear PROVIDER]');
  }

  // ── /config ───────────────────────────────────────────────────────────────
  async _handleConfigCommand(args) {
    if (args.length === 0) { printConfig(getAllConfig()); return; }
    if (args[0] === 'set' && args.length >= 3) {
      const key = args[1];
      const val = args.slice(2).join(' ');
      setConfig(key, val);
      printSuccess(`Set ${key} = ${val}`);
      return;
    }
    if (args[0] === 'get' && args[1]) {
      printInfo(`${args[1]} = ${JSON.stringify(getConfig(args[1]))}`);
      return;
    }
    printWarning('Usage: /config [set KEY VALUE | get KEY]');
  }

  // ── /memory ───────────────────────────────────────────────────────────────
  _showMemory() {
    const keys = Object.keys(this.memory);
    if (keys.length === 0) { printInfo('Memory is empty.'); return; }
    printInfo(`Session memory (${keys.length} entries) — persisted in .dmcode-memory.json:`);
    for (const [k, v] of Object.entries(this.memory)) {
      console.log(`  ${chalk.dim(k)}: ${String(v).slice(0, 80)}`);
    }
  }

  async _loadMemory() {
    try {
      const data = await fs.readFile(this._memoryFile, 'utf-8');
      this.memory = JSON.parse(data);
    } catch (err) {
      if (process.env.DEBUG && err.code !== 'ENOENT') console.error('[dmcode] memory load failed:', err.message);
      this.memory = {};
    }
  }

  async _saveMemory() {
    try {
      await fs.writeFile(this._memoryFile, JSON.stringify(this.memory, null, 2), 'utf-8');
    } catch (err) {
      if (process.env.DEBUG) console.error('[dmcode] memory save failed:', err.message);
    }
  }

  // ── /cd ───────────────────────────────────────────────────────────────────
  async _changeDirectory(target) {
    if (!target) { printInfo(`CWD: ${this.cwd}`); return; }
    const newCwd = path.resolve(this.cwd, target);
    try {
      await fs.access(newCwd);
      this.cwd = newCwd;
      if (this.agent) {
        this.agent.cwd = newCwd;
        this.agent.executor.cwd = newCwd;
      }
      // Update memory file path to new directory
      this._memoryFile = path.join(this.cwd, '.dmcode-memory.json');
      await this._loadMemory();
      printSuccess(`Changed to: ${newCwd}`);
      printSessionLine(this.cwd, MODEL_DISPLAY);
    } catch {
      printError(`Directory not found: ${newCwd}`);
    }
  }

  // ── Tool confirmation ─────────────────────────────────────────────────────
  async _confirmTool(toolName, params) {
    const details = this._describeToolAction(toolName, params);
    printConfirmBox(`Allow: ${toolName}`, details);
    return new Promise((resolve) => {
      this.input.rl.question(chalk.yellow('\n  Your choice [y/n/a]: '), (answer) => {
        const a = answer.trim().toLowerCase();
        if (a === 'a') {
          this.autoApprove = true;
          this.agent.setAutoApprove(true);
          printInfo('Auto-approve enabled for remaining operations.');
          resolve(true);
        } else {
          resolve(a === 'y' || a === 'yes');
        }
      });
    });
  }

  _describeToolAction(toolName, params) {
    switch (toolName) {
      case 'write_file':  return [`File: ${params.path}`, `Size: ~${(params.content || '').length} chars`];
      case 'edit_file':   return [`File: ${params.path}`, `Replace: ${(params.old_string || '').slice(0, 60)}`];
      case 'delete_file': return [`Path: ${params.path}`, params.recursive ? 'Mode: recursive' : ''];
      case 'move_file':   return [`From: ${params.source}`, `To: ${params.destination}`];
      case 'run_command': return [`Command: ${params.command}`];
      default:            return [JSON.stringify(params).slice(0, 100)];
    }
  }

  // ── Ctrl+C ────────────────────────────────────────────────────────────────
  _handleInterrupt() {
    if (this.processing && this.agent) {
      this.agent.abort();
      this.processing = false;
      stopThinking();
      console.log();
      printWarning('Interrupted — press Enter to continue.');
      this.input.resume();
    } else if (this._pendingExit) {
      this._exit();
    } else {
      this._pendingExit = true;
      console.log();
      printInfo('Press Ctrl+C again or /exit to quit.');
    }
  }

  _exit() {
    if (this._exiting) return;
    this._exiting = true;
    console.log();
    if (this.agent) this.agent.markSessionCompleted();
    printInfo(`Thanks for using ${TOOL_NAME}. Goodbye!`);
    console.log();
    this.input.close();
    process.exit(0);
  }

  // ── /compact ──────────────────────────────────────────────────────────────
  async _compact(instruction) {
    if (!this.agent) { printWarning('No active agent.'); return; }
    await this.agent.compactHistory(instruction || 'manual');
  }

  // ── /cost ─────────────────────────────────────────────────────────────────
  _showCost() {
    if (!this.agent) { printWarning('No active agent.'); return; }
    const modelId = getSelectedModelId();
    const model   = getModelById(modelId);
    printCostSummary(
      this.agent.inputTokens,
      this.agent.outputTokens,
      model.displayName,
      this.agent.turnCount
    );
  }

  // ── /resume ───────────────────────────────────────────────────────────────
  async _resumeSession(sessionId) {
    if (!sessionId) {
      const sessions = await SessionPersistence.listSessions();
      printSessionList(sessions);
      if (sessions.length > 0) printInfo('Usage: /resume <session-id>');
      return;
    }
    if (!this.agent) { printWarning('No active agent.'); return; }
    const restored = await this.agent.restoreSession(sessionId);
    if (!restored) printError(`Session not found: ${sessionId}`);
  }

  // ── /sessions ─────────────────────────────────────────────────────────────
  async _listSessions() {
    const sessions = await SessionPersistence.listSessions();
    printSessionList(sessions);
  }

  // ── /undo — restore the last file overwritten by Annihilator ─────────────
  async _handleUndo() {
    if (!this.agent) { printWarning('No active agent.'); return; }
    await this.agent.undoLastEdit();
  }

  // ── /save — export session to Markdown ───────────────────────────────────
  async _handleSave(userFilename) {
    const history = this.agent?.history || [];
    const modelId = getSelectedModelId();
    const model   = getModelById(modelId);

    const timestamp   = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultName = `dm-session-${timestamp}.md`;
    const filename    = userFilename ?? defaultName;
    const outputPath  = path.isAbsolute(filename) ? filename : path.join(this.cwd, filename);

    fsSync.mkdirSync(path.dirname(outputPath), { recursive: true });

    const lines = [];
    lines.push(`# DM Code Session`);
    lines.push(``);
    lines.push(`| Field | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| **Exported** | ${new Date().toISOString()} |`);
    lines.push(`| **Model** | ${model.displayName} |`);
    lines.push(`| **Working Dir** | \`${this.cwd}\` |`);
    lines.push(`| **Session ID** | \`${this.agent?.getSessionId() || 'n/a'}\` |`);
    lines.push(`| **Messages** | ${history.length} |`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);

    for (const msg of history) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'user' ? '## 👤 User' : '## 🤖 Annihilator';
      lines.push(role);
      lines.push(``);

      if (typeof msg.content === 'string') {
        lines.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            lines.push(block.text);
          } else if (block.type === 'tool_use') {
            lines.push(`> 🔧 Tool call: \`${block.name}\``);
            lines.push(`> \`\`\`json`);
            lines.push(`> ${JSON.stringify(block.input, null, 2)}`);
            lines.push(`> \`\`\``);
          } else if (block.type === 'tool_result') {
            lines.push(`> ✅ Tool result:`);
            lines.push(`> \`\`\``);
            lines.push(`> ${String(block.content).slice(0, 500)}`);
            lines.push(`> \`\`\``);
          }
        }
      }

      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    try {
      fsSync.writeFileSync(outputPath, lines.join('\n'), 'utf8');
      printSuccess(`Session saved → ${outputPath}`);
    } catch (err) {
      printError(`Save failed: ${err.message}`);
    }
  }
}
