#!/usr/bin/env node
// DM Code — CLI Entry Point

import { program }  from 'commander';
import { REPL }     from '../src/repl.js';
import { AgentLoop } from '../src/agent/loop.js';
import {
  getApiKey, setApiKey, getAllConfig, setConfig,
  getSelectedModelId, setSelectedModelId,
} from '../src/config/settings.js';
import {
  TOOL_NAME, TOOL_VERSION, MODEL_DISPLAY,
  MODELS, getModelById,
} from '../src/config/constants.js';
import { printError, printSuccess, printInfo, printWarning, printSessionList } from '../src/ui/renderer.js';
import { showModelPicker, providerBadge } from '../src/ui/model-picker.js';
import { SessionPersistence } from '../src/agent/session.js';
import chalk from 'chalk';

program
  .name('dm')
  .description(`${TOOL_NAME} — Agentic AI coding assistant powered by Annihilator`)
  .version(TOOL_VERSION, '-v, --version', 'Print version');

// ── Default: interactive REPL ─────────────────────────────────────────────────
program
  .argument('[prompt]', 'Run a single prompt non-interactively')
  .option('-d, --cwd <dir>',    'Set working directory', process.cwd())
  .option('-p, --print <text>', 'Run a single prompt and print output (alias for positional prompt)')
  .option('--auto-approve',     'Auto-approve all tool calls')
  .option('--verbose',          'Verbose tool output')
  .option('--model <id>',       'Override model for this session')
  .option('--resume [id]',      'Resume a previous session (optionally by ID)')
  .action(async (prompt, opts) => {
    // --print / -p is an alias for the positional prompt argument
    const userPrompt = prompt || opts.print || null;

    // CLI model override
    if (opts.model) {
      const found = MODELS.find(
        m => m.id === opts.model ||
             m.displayName.toLowerCase().includes(opts.model.toLowerCase())
      );
      if (!found) {
        printError(`Unknown model: ${opts.model}`);
        console.log(chalk.dim('  Run: dmcode models'));
        process.exit(1);
      }
      setSelectedModelId(found.id);
    }

    // --resume flag
    if (opts.resume !== undefined) {
      let sessionId = typeof opts.resume === 'string' ? opts.resume : null;

      if (!sessionId) {
        const sessions = await SessionPersistence.listSessions();
        if (sessions.length === 0) {
          printInfo('No saved sessions to resume.');
          process.exit(0);
        }
        printSessionList(sessions);

        // Auto-pick most recent crashed session, otherwise most recent
        const crashed = sessions.filter(s => s.status === 'active');
        if (crashed.length > 0) {
          sessionId = crashed[0].id;
          printInfo(`Auto-resuming most recent crashed session: ${sessionId}`);
        } else {
          sessionId = sessions[0].id;
          printInfo(`Resuming most recent session: ${sessionId}`);
        }
      }

      const repl = new REPL({
        cwd:             opts.cwd,
        autoApprove:     opts.autoApprove || false,
        verbose:         opts.verbose     || false,
        resumeSessionId: sessionId,
      });
      await repl.start();
      return;
    }

    // Single-prompt non-interactive mode
    if (userPrompt) {
      await runSinglePrompt(userPrompt, {
        cwd:         opts.cwd,
        autoApprove: opts.autoApprove || false,
        verbose:     opts.verbose     || false,
      });
      return;
    }

    // Check for crashed sessions on startup
    const crashed = await SessionPersistence.findCrashedSessions();
    if (crashed.length > 0) {
      console.log();
      printInfo(`Found ${crashed.length} crashed session(s). Use --resume to recover.`);
    }

    const repl = new REPL({
      cwd:         opts.cwd,
      autoApprove: opts.autoApprove || false,
      verbose:     opts.verbose     || false,
    });
    await repl.start();
  });

// ── dm models — list all available models ─────────────────────────────────────
program
  .command('models')
  .description('List all available free models')
  .action(() => {
    const current = getSelectedModelId();
    const TIER = {
      FREE:       chalk.green.bold('FREE'),
      FREE_QUOTA: chalk.yellow.bold('FREE*'),
    };
    console.log();
    console.log(chalk.bold('  Annihilator Engine Options'));
    console.log(chalk.dim('  ' + '─'.repeat(72)));
    console.log(chalk.dim('  FREE = unlimited free  |  FREE* = free with monthly quota'));
    console.log();

    let lastProvider = null;
    for (const m of MODELS) {
      if (m.provider !== lastProvider) {
        lastProvider = m.provider;
        console.log('  ' + providerBadge(m.provider));
      }
      const isCurrent = m.id === current;
      const marker = isCurrent ? chalk.green(' ◆ ') : '   ';
      const name   = isCurrent ? chalk.bold.white(m.displayName) : chalk.white(m.displayName);
      const tier   = TIER[m.tier] || m.tier;
      const rec    = m.recommended ? chalk.hex('#CC785C')(' ✦ recommended') : '';
      console.log(`${marker}${name.padEnd(34)} ${tier}  ${chalk.dim(m.speed.padEnd(14))}${rec}`);
      console.log(chalk.dim(`       ID: ${m.id}`));
      console.log(chalk.dim(`       Best for: ${m.bestFor}`));
      console.log();
    }

    console.log(chalk.dim('  Switch interactively:  dmcode model'));
    console.log(chalk.dim('  Switch by CLI:         dmcode --model <id> "your prompt"'));
    console.log();
  });

// ── dm model — interactive picker ─────────────────────────────────────────────
program
  .command('model')
  .description('Interactively choose your model engine')
  .action(async () => {
    await showModelPicker({ title: 'Choose Annihilator engine', showApiSetup: true });
    console.log(chalk.dim('  Run dmcode to start with your new engine.'));
    console.log();
    process.exit(0);
  });

// ── dm keys — manage API keys ─────────────────────────────────────────────────
program
  .command('keys')
  .description('Manage API keys for all providers')
  .argument('[action]',   'list | set | clear')
  .argument('[provider]', 'anthropic | google | groq | mistral')
  .argument('[key]',      'Your API key')
  .action((action, provider, key) => {
    const providers = ['anthropic', 'google', 'groq', 'mistral'];

    if (!action || action === 'list') {
      console.log();
      console.log(chalk.bold('  API Keys per Provider'));
      console.log(chalk.dim('  ' + '─'.repeat(60)));
      for (const p of providers) {
        const k = getApiKey(p);
        const m = MODELS.find(m => m.provider === p);
        const status = k
          ? chalk.green('● set') + chalk.dim(` …${k.slice(-8)}`)
          : chalk.red('✗ not set');
        console.log(`  ${providerBadge(p)} ${status}`);
        if (!k && m) console.log(chalk.dim(`       Get key: ${m.apiKeyUrl}`));
        if (!k && m) console.log(chalk.dim(`       Env var: ${m.apiKeyEnv}`));
        console.log();
      }
      return;
    }

    if (action === 'set') {
      if (!provider || !key) { printError('Usage: dmcode keys set PROVIDER YOUR_KEY'); return; }
      if (!providers.includes(provider)) { printError(`Unknown provider: ${provider}`); return; }
      setApiKey(provider, key);
      printSuccess(`Saved API key for ${providerBadge(provider)}`);
      return;
    }

    if (action === 'clear') {
      if (!provider) { printError('Usage: dmcode keys clear PROVIDER'); return; }
      setApiKey(provider, '');
      printSuccess(`Cleared key for ${provider}.`);
      return;
    }
  });

// ── dm config ─────────────────────────────────────────────────────────────────
program
  .command('config')
  .description('View or set configuration')
  .argument('[action]', 'get | set | reset')
  .argument('[key]',    'Config key')
  .argument('[value]',  'Config value')
  .action((action, key, value) => {
    if (!action) {
      const cfg = getAllConfig();
      console.log('\n  DM Code Configuration\n  ' + '─'.repeat(44));
      for (const [k, v] of Object.entries(cfg)) {
        console.log('  ' + k.padEnd(26) + chalk.cyan(JSON.stringify(v)));
      }
      console.log();
      return;
    }
    if (action === 'set' && key) {
      setConfig(key, value);
      printSuccess(`Set ${key} = ${value}`);
      return;
    }
  });

// ── dm setup — guided first-time setup ───────────────────────────────────────
program
  .command('setup')
  .description('Run guided first-time setup (model + API keys)')
  .action(async () => {
    await showModelPicker({ title: 'DM Code Setup — Choose your Annihilator engine', showApiSetup: true });
    console.log();
    printSuccess('Setup complete! Run dm to start coding.');
    console.log();
    process.exit(0);
  });

// ── dm update — check for a newer version on npm ─────────────────────────────
program
  .command('update')
  .description('Check for a newer version of DM Code on npm')
  .action(async () => {
    console.log();
    printInfo('Checking npm for the latest version…');
    try {
      const res = await fetch('https://registry.npmjs.org/dm-code/latest', {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
      const data  = await res.json();
      const latest = data.version;

      if (latest === TOOL_VERSION) {
        printSuccess(`You are on the latest version: v${TOOL_VERSION}`);
      } else {
        console.log();
        console.log(chalk.bold.hex('#CC785C')(`  ⬆  Update available: v${TOOL_VERSION} → v${latest}`));
        console.log();
        console.log(chalk.dim('  To update, run one of:'));
        console.log(chalk.cyan('    npm install -g dm-code'));
        console.log(chalk.cyan('    npm install -g git+https://github.com/Dipendu27/dm-code.git'));
        console.log();
        console.log(chalk.dim(`  Changelog: https://github.com/Dipendu27/dm-code/blob/main/CHANGELOG.md`));
      }
    } catch (err) {
      printWarning(`Could not reach npm registry: ${err.message}`);
      console.log(chalk.dim('  Check manually: https://www.npmjs.com/package/dm-code'));
    }
    console.log();
    process.exit(0);
  });

// ── dm version ────────────────────────────────────────────────────────────────
program
  .command('version')
  .description('Show detailed version info')
  .action(() => {
    const modelId = getSelectedModelId();
    const model   = getModelById(modelId);
    console.log();
    console.log(chalk.bold.hex('#CC785C')(`  ${TOOL_NAME}`));
    console.log(chalk.dim(`  Version:  ${TOOL_VERSION}`));
    console.log(chalk.dim(`  Model:    ${MODEL_DISPLAY}`));
    console.log(chalk.dim(`  Engine:   ${model.displayName} (${model.id})`));
    console.log(chalk.dim(`  Provider: ${model.providerLabel}`));
    console.log(chalk.dim(`  Node:     ${process.version}`));
    console.log(chalk.dim(`  Arch:     ${process.arch}`));
    console.log(chalk.dim(`  OS:       ${process.platform}`));
    console.log(chalk.dim(`  Update:   dmcode update`));
    console.log();
  });

// ── Single-prompt runner ──────────────────────────────────────────────────────
async function runSinglePrompt(prompt, { cwd, autoApprove, verbose }) {
  const modelId = getSelectedModelId();
  const model   = getModelById(modelId);
  const key     = getApiKey(model.provider);

  if (!key) {
    printError(`No API key for ${model.providerLabel}.`);
    console.log(chalk.dim(`  Run: dmcode keys set ${model.provider} YOUR_KEY`));
    process.exit(1);
  }

  const agent = new AgentLoop({
    cwd,
    autoApprove,
    verbose,
    memoryRef: {},
    onConfirm: async (toolName, params) => {
      const { isSafeCommand } = await import('../src/tools/executor.js');
      if (toolName === 'run_command' && isSafeCommand(params?.command || '')) return true;
      console.log(
        chalk.yellow(`\n  ⚠ Auto-approving: ${toolName}`) +
        chalk.dim(` (${(params?.command || params?.path || '').slice(0, 60)})`)
      );
      return true;
    },
  });

  try {
    await agent.run(prompt);
  } catch (err) {
    printError(err.message);
    process.exit(1);
  }
}

// ── Global error handlers ─────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('\n  ✗ Unexpected error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  console.error('  Please report this at: https://github.com/Dipendu27/dm-code/issues\n');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n  ✗ Unhandled error:', reason?.message || reason);
  if (process.env.DEBUG) console.error(reason?.stack || reason);
  process.exit(1);
});

program.parse();
