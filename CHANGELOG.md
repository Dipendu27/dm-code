# Changelog — DM Code

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.4] — 2026-07-02

### ✨ Major Features
- **Claude Code Parity & Model Updates** — Swapped default Llama model to Qwen 2.5 Coder 32B (`qwen/qwen3.6-27b`). Updated deprecated Groq models and retired Haiku 3.5 → Haiku 4.5.
- **Streaming Markdown Renderer** — Rewrite of streaming markdown parsing using `cli-highlight` for syntax highlighting without leaking code-block language tags.
- **Task Planning (`update_todos`)** — Built-in `update_todos` tool with live terminal task checklist rendering (`○`, `◐`, `✓`).
- **Interactive Model Picker** — Arrow-key and number navigation without clearing the screen or layering multiple readline interfaces.

### 🎨 UI & UX Refinements
- **Minimal Tool UI** — Replaced emoji badges with sleek `⏺` markers and verb-cased tool labels (`Read`, `Write`, `Edit`, `Bash`, `Plan`).
- **Punchier Spinner** — Trimmed thinking spinner messages to 1–3 words and added explicit `(Ctrl+C to interrupt)` hint.

### 🐛 Bug Fixes & Cleanup
- Fixed `MAX_TOKENS` typo and removed unused standalone imports/helpers.
- Updated installation scripts (`install.sh` and `install.ps1`).

---

## [1.3.3] — 2026-06-26

### ✨ Major Features
- **IDE Diff Viewer & Thought Blocks** — Added interactive diff viewer and backend thought block rendering in terminal.

### 🐛 Bug Fixes
- **Google Gemini Endpoints** — Updated model endpoints to resolve 404 Not Found API errors.

---

## [1.3.2] — 2026-06-25

### 🔒 Security & Automation
- **Path Traversal Patch** — Secured path traversal edge cases in validation and session modules.
- **CI Workflow & Auto-Approve** — Added automated CI workflow and secure `--auto-approve` flag for non-interactive execution of dangerous commands.

---

## [1.3.1] — 2026-06-25

### ✨ Major Features & Audit Fixes
- **Comprehensive Audit Fixes (Phases 1–4)** — Improved URL sanitization, humanized error messages, interactive keys, `.env` file loading, and localized formatting.
- **Package Release Preparation** — Cleaned up package metadata, `.npmignore`, and installation documentation for npm distribution.

---

## [1.3.0] — 2024-06-25

### ✨ Major Features
- **MCP Schema Management** — Full support for Model Context Protocol.
- **Session Persistence & Restore** — Automatically saves session state; restore with `/resume <id>`.
- **Free-Tier Optimization** — Revamped provider fallback logic prioritizes truly free models (Google, Groq) before quota-based ones.

### 🔒 Security Improvements
- **URL Sanitization** — `web_fetch` now blocks SSRF targets, private IPs, and non-HTTP protocols.
- **Interactive Keys** — `/keys set <provider>` now prompts interactively, keeping keys out of shell history.
- **Strict Rate Limit Handling** — Fast-fails on 429s and billing errors, instantly failing over to the next available provider.

### 🚀 Performance Enhancements
- **`.env` File Support** — Zero-dependency dotenv loading on startup.
- **Task-Level Progress Indicator** — Improved visibility into multi-step agent actions.
- **International Formatting** — Consistent en-US number formatting for token counts globally.
- **Humanized Errors** — Clean, actionable error messages replace raw API JSON dumps.

### 🐛 Bug Fixes
- Fixed an off-by-one error in MCP schema pruning logic.
- Fixed logger `time()` closure bug.
- Fixed Gemini streaming to correctly handle function response parts.
- Fixed Groq retry loop getting stuck for 33s on rate limits.

---

## [1.2.0] — 2024-01-XX

### ✨ Major Features

- **Input Validation Layer** — New `src/utils/validation.js` module
  - File path validation to prevent directory traversal attacks
  - Shell command safety checks with detailed risk reasons
  - JSON schema validation helpers
  - Rate limiter class for request throttling
  - Safe string truncation utilities

- **Error Handling & Recovery** — New `src/utils/errors.js` module
  - Custom error hierarchy: `APIError`, `FileError`, `ValidationError`, `ToolError`, `SessionError`, `ConfigError`
  - Error classification: `isRateLimit()`, `isServerError()`, `isAuthError()`, `isRetryable()`
  - `retryAsync()` with exponential backoff and jitter (capped at 30s)
  - `withTimeout()` promise wrapper for operation timeouts
  - User-friendly error messages via `toUserMessage()`
  - Debug error logging with context

- **Structured Logging** — New `src/utils/logger.js` module
  - Namespaced logger instances for different components
  - Log levels: ERROR, WARN, INFO, DEBUG, TRACE
  - DEBUG environment variable support for diagnostics
  - Timing instrumentation for performance monitoring
  - Colorized output with timestamps

### 🔒 Security Improvements

- **Path Traversal Prevention** — All file operations now validate paths against base directory
  - `validateFilePath()` prevents `../../../etc/passwd` style attacks
  - Absolute path normalization before operations
  - Clear error messages for invalid paths

- **Command Injection Prevention** — Enhanced dangerous pattern detection
  - Better regex patterns for common injection attacks
  - Distinction between dangerous and safe commands
  - Improved dangerous pattern list with explanations
  - Windows-specific command safety checks

- **API Key Safety** — Configuration still masks keys in logs and display

### 🐛 Bug Fixes

- Fixed exponential backoff calculation in retry logic
- Improved rate limit error detection across providers
- Better handling of large file reads (now blocks files > 2MB)
- Fixed context window ceiling to match largest model (1M tokens)

### 🚀 Performance Enhancements

- Request timeout handling now configurable per API call (REQUEST_TIMEOUT_MS = 60s)
- Streaming response parsing optimized for large outputs
- MCP schema lazy-loading prevents token inflation
- Session cleanup now async with configurable TTL

### 📚 Documentation

- Added comprehensive JSDoc comments to new utility modules
- Error types documented with usage examples
- Validation function signatures clearly documented
- Logger API documented with examples

### 🔧 Code Quality

- Moved error types to dedicated module for better organization
- Separated validation logic from tool executor
- Logging infrastructure ready for distributed tracing
- Better module structure with clear responsibilities

### 📦 Dependencies

- No new dependencies added (uses existing chalk, fs, path)
- All utilities are pure Node.js modules

### ⚠️ Breaking Changes

- None — all changes are backward compatible

### 🚫 Deprecations

- None currently

### 🔄 Refactoring

- `src/utils/validation.js` — New validation module
- `src/utils/errors.js` — New error handling module
- `src/utils/logger.js` — New logging module
- Version bumped to 1.2.0

---

## [1.1.2] — 2024-01-13

### 🔧 Critical Bug Fixes

- Fixed Anthropic model IDs — `claude-haiku-3-5` → `claude-haiku-4-5`, `claude-sonnet-4-5` → `claude-sonnet-4-6` (previous IDs caused "model not found" API errors)
- Updated Claude Sonnet 4.6 context window from 200K → **1M tokens** (matches Anthropic docs)
- Updated global `MAX_CONTEXT_TOKENS` ceiling to 1M to match largest supported model
- Added `DEBUG=1` env var support for diagnosing silent errors in session/memory persistence

---

## [1.1.1] — 2024-01-12

### 🛑 Ctrl+C Interrupt Fix

- Ctrl+C now **always works** — even while the AI is processing or streaming
- Fixed on Windows: readline is no longer paused, so SIGINT stays alive on all platforms
- Added process-level SIGINT fallback for Windows terminal edge cases
- Abort signal now passed to API calls for instant network cancellation
- Fixed double "Goodbye!" message on exit (debounced duplicate SIGINT handlers)

---

## [1.1.0] — 2024-01-11

### 🎯 Exit & Interrupt Fixes

- `exit`, `quit`, and `q` now work directly — no need to type `/exit`
- Double `Ctrl+C` now reliably exits the app (fixed race condition)

### ✨ Animated Thinking Spinner

- New braille-animated spinner with fun rotating status messages while the AI is processing
- Shows elapsed time so you always know something is happening
- Messages cycle through: *"Cooking up a response…"*, *"Diving deep into the code…"*, *"Weaving some magic…"* and more

---

## [1.0.1] — 2024-01-10

- Initial streaming support across all 4 providers
- `/save` command for session export
- Automatic rate-limit fallback across providers
- Session persistence and restore
- Context window auto-compaction

---

## [1.0.0] — 2024-01-09

### Initial Release

- **11 free models** across 4 providers (Anthropic, Google, Groq, Mistral)
- **12 built-in tools** (read, write, edit, run, search, etc.)
- **Interactive model picker** and API key management
- **Session persistence** with crash recovery
- **Multi-platform** (macOS, Linux, Windows)
- **Streaming responses** from all providers
- **Context window auto-compaction** for long sessions
- **Slash commands** for session control

---

## How to Report Issues

Found a bug? [Open an issue](https://github.com/Dipendu27/dm-code/issues) on GitHub.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT — see [LICENSE](./LICENSE) for details.
