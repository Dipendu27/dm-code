# DM Code ⚡

> Agentic AI coding assistant for your terminal — powered by **Annihilator**

[![dm-code version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FDipendu27%2Fdm-code%2Fmain%2Fpackage.json&query=%24.version&label=dm-code&color=blueviolet&logo=npm)](https://github.com/Dipendu27/dm-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue.svg)](#)

```
  ██████╗ ███╗   ███╗     ██████╗ ██████╗ ██████╗ ███████╗
  ██╔══██╗████╗ ████║    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
  ██║  ██║██╔████╔██║    ██║     ██║   ██║██║  ██║█████╗
  ██║  ██║██║╚██╔╝██║    ██║     ██║   ██║██║  ██║██╔══╝
  ██████╔╝██║ ╚═╝ ██║    ╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═╝     ╚═╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

DM Code is a **free, open-source Claude Code alternative** that runs from your terminal on **macOS, Linux, and Windows**. Choose your engine from **10 free models** across 4 providers — Anthropic, Google, Groq, and Mistral — and switch between them at any time.

---

## Quick Install

```bash
git clone https://github.com/Dipendu27/dm-code.git
cd dm-code
npm install
npm link
```

> **Note:** `npm link` registers `dmcode`, `dm`, `dm-code`, and `annihilator` as global commands.
> On macOS/Linux you can also run: `npm install -g dm-code`

That's it. Now type `dmcode` from **any directory** on **any device**:

```bash
dmcode              # start interactive session
dm                  # shorthand — also works
dm-code             # also works
annihilator         # also works
```

### First-time setup

```bash
dmcode setup        # guided model + API key configuration
```

---

## 🔄 How to Update

Already have DM Code installed? Pull the latest and re-link:

```bash
cd dm-code
git pull
npm install
npm link
```

Check your version:
```bash
dmcode --version
```

---

## 📋 Changelog

### v1.3.4 — *Latest*

**🐛 Bug Fixes**
- **Google API Compatibility**: Updated Google Gemini model endpoints from `gemini-2.0-flash-thinking-exp` to `gemini-2.5-pro` and `gemini-3.5-flash` to resolve a `404 Not Found` API breakage caused by Google deprecating experimental endpoints.

### v1.3.3

**✨ Major Features**
- **IDE Diff Viewer**: DM Code now automatically opens a side-by-side diff in your IDE (VS Code or Cursor) whenever it modifies a file using the `edit_file` or `write_file` tools.
- **Backend Thought Blocks**: Added native terminal rendering for `<think>` blocks. When models like DeepSeek R1 or Gemini Thinking emit thought processes, they are now neatly formatted in a dimmed `▶ Backend thought` block in real-time.

### v1.3.2

**✨ Major Features**
- New input validation layer prevents directory traversal & injection attacks
- Enhanced error handling with retry logic, exponential backoff, and timeouts
- Structured logging system with DEBUG support for diagnostics
- New utility modules: `validation.js`, `errors.js`, `logger.js`

**🔒 Security Improvements**
- Path traversal prevention for all file operations
- Improved command injection pattern detection
- Better dangerous command classification with explanations

**🚀 Performance & Reliability**
- Configurable request timeouts (60s default)
- Exponential backoff with jitter for retries (capped at 30s)
- Optimized streaming response parsing
- Better session cleanup and MCP schema management

[See full CHANGELOG](./CHANGELOG.md)

### v1.1.2

**🔧 Critical Bug Fixes**
- Fixed Anthropic model IDs — `claude-haiku-3-5` → `claude-haiku-4-5`, `claude-sonnet-4-5` → `claude-sonnet-4-6` (previous IDs caused "model not found" API errors)
- Updated Claude Sonnet 4.6 context window from 200K → **1M tokens** (matches Anthropic docs)
- Updated global `MAX_CONTEXT_TOKENS` ceiling to 1M to match largest supported model
- Added `DEBUG=1` env var support for diagnosing silent errors in session/memory persistence

### v1.1.1

**🛑 Ctrl+C Interrupt Fix**
- Ctrl+C now **always works** — even while the AI is processing or streaming
- Fixed on Windows: readline is no longer paused, so SIGINT stays alive on all platforms
- Added process-level SIGINT fallback for Windows terminal edge cases
- Abort signal now passed to API calls for instant network cancellation
- Fixed double "Goodbye!" message on exit (debounced duplicate SIGINT handlers)

### v1.1.0

**🎯 Exit & Interrupt Fixes**
- `exit`, `quit`, and `q` now work directly — no need to type `/exit`
- Double `Ctrl+C` now reliably exits the app (fixed race condition)

**✨ Animated Thinking Spinner**
- New braille-animated spinner with fun rotating status messages while the AI is processing
- Shows elapsed time so you always know something is happening
- Messages cycle through: *"Cooking up a response…"*, *"Diving deep into the code…"*, *"Weaving some magic…"* and more

### v1.0.1

- Initial streaming support across all 4 providers
- `/save` command for session export
- Automatic rate-limit fallback across providers
- Session persistence and restore
- Context window auto-compaction

### v1.0.0

- Initial release with 10 free models across 4 providers
- 13 built-in tools (read, write, edit, run, search, plan, etc.)
- Interactive model picker and API key management

---

## Free Models Available

| # | Model | Provider | Tier | Speed | Best For |
|---|-------|----------|------|-------|----------|
| 1 | **Claude Haiku 4.5** ✦ | Anthropic | FREE* | Fastest | Quick tasks, code completion, fast iteration |
| 2 | Claude Sonnet 4.6 | Anthropic | FREE* | Fast | Complex refactoring, architecture, debugging |
| 3 | **Gemini 3.5 Flash** ✦ | Google | FREE | Fastest | Large codebase analysis, massive context tasks |
| 4 | Gemini 2.5 Pro | Google | FREE | Medium | Hard algorithmic problems, deep reasoning |
| 5 | Gemini 2.5 Flash | Google | FREE | Very Fast | Lightweight coding tasks, large file reads |
| 6 | **GPT-OSS 120B (Groq)** ✦ | Groq | FREE | Ultra-fast | General coding, fastest open-source quality |
| 7 | GPT-OSS 20B (Groq) | Groq | FREE | Instant | Super-fast small tasks, scripts, one-liners |
| 8 | Qwen3.6 27B | Groq | FREE | Fast | Multilingual reasoning, dense-model quality |
| 9 | Mistral Small | Mistral | FREE* | Fast | European data privacy, multilingual code |
| 10 | Codestral | Mistral | FREE* | Fast | Code-only tasks — fill-in-the-middle, completions |

> **FREE** = permanently unlimited free  
> **FREE\*** = free with monthly quota (generous for personal use)  
> **✦** = recommended picks

---

## Requirements

| Item | Requirement |
|---|---|
| OS | macOS, Linux, or Windows |
| Node.js | v20 or later |
| API key | At least one free key from any provider below |

---

## Installation

### Option 1: npm global install (recommended)

```bash
npm install -g dm-code
dmcode setup
```

Works on macOS, Linux, and Windows. The `dmcode` command becomes available system-wide immediately.

### Option 2: Platform-specific installers

<details>
<summary><strong>macOS / Linux</strong></summary>

```bash
git clone https://github.com/Dipendu27/dm-code.git
cd dm-code
bash install.sh
```

The script auto-detects your OS and package manager (Homebrew, apt, dnf, yum, pacman), installs Node.js if needed, links `dmcode` globally, and walks you through API key setup.

</details>

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

```powershell
git clone https://github.com/Dipendu27/dm-code.git
cd dm-code
.\install.ps1
```

The script checks Node.js, installs dependencies, links `dmcode` globally, and walks you through API key setup.

</details>

### Option 3: Manual install (developers)

```bash
git clone https://github.com/Dipendu27/dm-code.git
cd dm-code
npm install
npm link           # makes dmcode available system-wide
dmcode setup       # guided model + key setup
```

---

## Getting Free API Keys

You only need **one** key to get started. All are free with no credit card required.

### Google AI Studio (recommended — truly unlimited free)
1. Go to **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account → Create API Key
3. Run: `dmcode keys set google YOUR_KEY`

### Groq (fastest inference, truly free)
1. Go to **https://console.groq.com/keys**
2. Sign up → Create Key
3. Run: `dmcode keys set groq YOUR_KEY`

### Anthropic (Claude models)
1. Go to **https://console.anthropic.com**
2. Sign up → API Keys → Create Key
3. Run: `dmcode keys set anthropic YOUR_KEY`

### Mistral
1. Go to **https://console.mistral.ai/api-keys**
2. Sign up → Create Key
3. Run: `dmcode keys set mistral YOUR_KEY`

---

## Usage

### Start interactive session

```bash
dmcode
```

On first run, the interactive model picker appears — choose your engine and paste your API key. Every subsequent run starts immediately.

### Switch your engine at any time

```bash
# Interactive picker (beautifully formatted table):
dmcode model

# Or from inside the REPL:
/model

# Or override for a single session:
dmcode --model gemini-3.5-flash "refactor my auth module"

# Or by model ID:
dmcode --model qwen/qwen3.6-27b "write unit tests for utils.py"
```

### List all models

```bash
dmcode models
```

### Manage API keys

```bash
dmcode keys                            # show status of all keys
dmcode keys set google AIzaSy...       # save a key
dmcode keys set groq gsk_...
dmcode keys clear groq                 # remove a key
```

---

## Slash Commands (inside the REPL)

| Command | Description |
|---|---|
| `/model` | Open the interactive model picker |
| `/models` | Quick list of all models with current marker |
| `/keys` | Show API key status for all providers |
| `/keys set PROVIDER KEY` | Save an API key |
| `/help` | Show all commands |
| `/clear` | Clear screen and reset conversation |
| `/reset` | Reset conversation history only |
| `/config` | View configuration |
| `/approve-all` | Toggle auto-approve for tool calls |
| `/verbose` | Toggle verbose tool output |
| `/memory` | Show session memory |
| `/cwd` | Show current working directory |
| `/cd <path>` | Change working directory |
| `/resume <id>` | Restore a previous session by its session ID (shown at startup) |
| `/save` | Export session to Markdown file |
| `/save <filename>` | Export session to a specific filename or path |
| `/exit` | Exit DM Code |

---

## Tools Available to Annihilator

| Tool | What it does |
|---|---|
| `read_file` | Read file contents (with optional line range) |
| `write_file` | Create or overwrite a file |
| `edit_file` | Surgical string replacement in a file |
| `run_command` | Execute shell commands |
| `list_files` | List directory contents with glob patterns |
| `search_files` | Regex / string search across files |
| `create_directory` | Create directories recursively |
| `delete_file` | Delete files or directories |
| `move_file` | Move or rename files |
| `web_fetch` | Fetch and read a URL |
| `memory_read` | Read from session memory |
| `memory_write` | Write to session memory |
| `update_todos` | Manage and display interactive task checklist plans |

---

## Project Structure

```
dm-code/
├── bin/
│   └── dm.js                   ← CLI entry point
├── src/
│   ├── repl.js                 ← Main REPL orchestrator
│   ├── agent/
│   │   ├── loop.js             ← Agentic loop (multi-provider)
│   │   ├── providers.js        ← Anthropic / Google / Groq / Mistral clients
│   │   ├── session.js          ← Session persistence ✨ new in v1.3
│   │   └── mcp-manager.js      ← MCP schema management ✨ new in v1.3
│   ├── tools/
│   │   └── executor.js         ← All 13 tool implementations
│   ├── ui/
│   │   ├── renderer.js         ← Terminal UI (Claude Code visual style)
│   │   ├── input.js            ← Readline REPL handler
│   │   └── model-picker.js     ← Interactive model selection UI
│   ├── config/
│   │   ├── constants.js        ← MODELS registry, theme, system prompt
│   │   └── settings.js         ← Persistent config (per-provider API keys)
│   └── utils/                  ← Shared utilities ✨ new in v1.3
│       ├── validation.js       ← Input validation & security checks
│       ├── errors.js           ← Custom error types & handling
│       └── logger.js           ← Structured logging
├── test-smoke.mjs              ← Smoke tests for session + MCP ✨ new in v1.3
├── install.sh                  ← macOS / Linux installer
├── install.ps1                 ← Windows PowerShell installer
├── CHANGELOG.md                ← Version history
├── .npmignore                  ← npm publish exclusions
├── .env.example                ← Environment variable template
├── package.json
└── README.md
```

---

## Session Persistence

DM Code automatically saves every session with a unique ID shown at startup:

```
ℹ Session ID: 3eb85a0c  (use /resume <id> to restore)
```

To restore a previous session:
```
/resume 3eb85a0c
```

Sessions persist your conversation history and working directory across restarts.
They are stored locally in your config directory and are never sent to any server.

---

## CLI Reference

```bash
dmcode                               # start interactive REPL
dmcode "your prompt"                 # single prompt, non-interactive
dmcode --model <id> "prompt"         # override engine for this run
dmcode --cwd /path/to/project        # set working directory
dmcode --auto-approve                # skip all confirmation prompts
dmcode --verbose                     # show full tool output

dmcode models                        # list all 10 free models
dmcode model                         # interactive model picker
dmcode keys                          # show API key status
dmcode keys set PROVIDER KEY         # save an API key
dmcode keys clear PROVIDER           # remove a key
dmcode config                        # show all settings
dmcode setup                         # guided first-time setup
dmcode version                       # detailed version info
```

> **Note:** `dm`, `dm-code`, and `annihilator` are aliases — all work identically.

---

## Environment Variables

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="AIzaSy..."
export GROQ_API_KEY="gsk_..."
export MISTRAL_API_KEY="..."
export DM_MODEL="gemini-3.5-flash"   # default engine override
export DEBUG=1                       # enable debug logging
export DEBUG=verbose                 # extra verbose debug output
```

Environment variables always take priority over saved config.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `↑` / `↓` | Navigate input history |
| `Ctrl+C` | Cancel current operation |
| `Ctrl+C` (twice) | Exit |

---

## Troubleshooting

### `dmcode: command not found`

```bash
# Re-link globally:
npm install -g dm-code

# Or from the project directory:
cd dm-code && npm link

# Windows: You may need to restart your terminal after install
```

### No API key error

```bash
dmcode keys set google AIzaSy...    # fastest to get, truly free
dmcode keys                          # verify status
```

### Node.js too old

```bash
# macOS:
brew upgrade node

# Linux (Debian/Ubuntu):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows:
winget upgrade OpenJS.NodeJS.LTS

# nvm (any platform):
nvm install 22 && nvm use 22
```

### Model not responding
Try a different provider — if Groq is rate-limiting, switch to Google:
```bash
dmcode model   # interactive picker
```

### Enable Debug Logging

For diagnostic information, run with DEBUG enabled:
```bash
DEBUG=1 dmcode
```

Or for very verbose logging:
```bash
DEBUG=verbose dmcode
```

---

## Publishing to npm

For maintainers:

```bash
npm login
npm publish --access public
```

Users can then install globally with `npm install -g dm-code`.

---

## Security & Privacy

- **File Operations**: All file paths are validated to prevent directory traversal
- **Command Execution**: Dangerous commands are flagged and require confirmation
- **API Keys**: Keys are stored in OS config and never logged
- **Sessions**: Session files are stored in `~/.dmcode/sessions` (local machine only)
- **No Telemetry**: DM Code collects no usage data

---

## License

MIT — free to use, modify, and distribute.

Built by [Dipendu Mukherjee](https://github.com/Dipendu27).  
Inspired by [Claude Code](https://claude.ai/code) by Anthropic.
