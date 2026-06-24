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

DM Code is a **free, open-source Claude Code alternative** that runs from your terminal on **macOS, Linux, and Windows**. Choose your engine from **11 free models** across 4 providers — Anthropic, Google, Groq, and Mistral — and switch between them at any time.

---

## Quick Install

### npm registry (after publish)

```bash
npm install -g dm-code
```

### From GitHub (always latest)

```bash
npm install -g git+https://github.com/Dipendu27/dm-code.git
```

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

## Free Models Available

| # | Model | Provider | Tier | Speed | Best For |
|---|-------|----------|------|-------|----------|
| 1 | **Claude Haiku 3.5** ✦ | Anthropic | FREE* | Fastest | Quick tasks, fast iteration |
| 2 | Claude Sonnet 4.5 | Anthropic | FREE* | Fast | Complex refactoring, architecture |
| 3 | **Gemini 2.0 Flash** ✦ | Google | FREE | Fastest | Large codebases, 1M token context |
| 4 | Gemini 2.0 Flash Thinking | Google | FREE | Medium | Hard algorithms, deep reasoning |
| 5 | Gemini 1.5 Flash | Google | FREE | Very Fast | Lightweight tasks, large file reads |
| 6 | **Llama 3.3 70B** ✦ | Groq | FREE | Ultra-fast | General coding, open-source quality |
| 7 | Llama 3.1 8B Instant | Groq | FREE | Instant | Scripts, one-liners, rapid output |
| 8 | Mixtral 8x7B | Groq | FREE | Very Fast | Code generation, multilingual |
| 9 | DeepSeek R1 70B | Groq | FREE | Fast | Math, algorithms, problem-solving |
| 10 | Mistral Small | Mistral | FREE* | Fast | Privacy-focused, EU projects |
| 11 | Codestral | Mistral | FREE* | Fast | Code-only, fill-in-the-middle |

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
npm install -g git+https://github.com/Dipendu27/dm-code.git
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
dmcode --model gemini-2.0-flash "refactor my auth module"

# Or by model ID:
dmcode --model llama-3.3-70b-versatile "write unit tests for utils.py"
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
│   │   └── providers.js        ← Anthropic / Google / Groq / Mistral clients
│   ├── tools/
│   │   └── executor.js         ← All 12 tool implementations
│   ├── ui/
│   │   ├── renderer.js         ← Terminal UI (Claude Code visual style)
│   │   ├── input.js            ← Readline REPL handler
│   │   └── model-picker.js     ← Interactive model selection UI
│   └── config/
│       ├── constants.js        ← MODELS registry, theme, system prompt
│       └── settings.js         ← Persistent config (per-provider API keys)
├── install.sh                  ← macOS / Linux installer
├── install.ps1                 ← Windows PowerShell installer
├── .npmignore                  ← npm publish exclusions
├── package.json
└── README.md
```

---

## CLI Reference

```bash
dmcode                               # start interactive REPL
dmcode "your prompt"                 # single prompt, non-interactive
dmcode --model <id> "prompt"         # override engine for this run
dmcode --cwd /path/to/project        # set working directory
dmcode --auto-approve                # skip all confirmation prompts
dmcode --verbose                     # show full tool output

dmcode models                        # list all 11 free models
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
export DM_MODEL="gemini-2.0-flash"   # default engine override
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
npm install -g git+https://github.com/Dipendu27/dm-code.git

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

---

## Publishing to npm

For maintainers:

```bash
npm login
npm publish
```

Users can then install globally with `npm install -g git+https://github.com/Dipendu27/dm-code.git` (or `npm install -g dm-code` once published).

---

## License

MIT — free to use, modify, and distribute.

Built by [Dipendu Mukherjee](https://github.com/Dipendu27).  
Inspired by [Claude Code](https://claude.ai/code) by Anthropic.
