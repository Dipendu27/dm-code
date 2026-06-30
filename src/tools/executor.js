// DM Code — Tool Implementations
// All tools that Annihilator can call during the agentic loop

import fs   from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os   from 'os';
import { execaCommand } from 'execa';
import { glob }         from 'glob';

// ─── Tool Definitions (Anthropic tool-use schema) ─────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. Returns file content as text. Use this to understand existing code before making changes.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read',
        },
        start_line: {
          type: 'integer',
          description: 'Optional: start reading from this line number (1-indexed)',
        },
        end_line: {
          type: 'integer',
          description: 'Optional: stop reading at this line number (inclusive)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist or overwriting it. Use for new files or full rewrites.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Path to write to' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Make a targeted edit to an existing file by replacing a specific string with new content. Preferred over write_file for surgical edits. The old_string must match EXACTLY (including whitespace/indentation).',
    input_schema: {
      type: 'object',
      properties: {
        path:       { type: 'string', description: 'Path to the file to edit' },
        old_string: { type: 'string', description: 'The exact string to find and replace' },
        new_string: { type: 'string', description: 'The replacement string' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the current working directory. Use for running tests, builds, git commands, npm/pip/brew operations, etc. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (defaults to current directory)',
        },
        timeout: {
          type: 'integer',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_files',
    description: 'List files and directories at a path. Shows directory tree structure.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Directory to list (default: current directory)' },
        recursive: { type: 'boolean', description: 'List recursively (default: false)' },
        pattern:   { type: 'string', description: 'Glob pattern filter (e.g., "**/*.js")' },
        depth:     { type: 'integer', description: 'Max recursion depth (default: 3)' },
      },
    },
  },
  {
    name: 'search_files',
    description: 'Search for a pattern (regex or literal string) across files in a directory. Returns file paths and matching lines with context.',
    input_schema: {
      type: 'object',
      properties: {
        pattern:   { type: 'string', description: 'Search pattern (regex or string)' },
        path:      { type: 'string', description: 'Directory to search in (default: current)' },
        glob:      { type: 'string', description: 'File glob filter (e.g., "**/*.py")' },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive search' },
        max_results: { type: 'integer', description: 'Max results to return (default: 50)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory and all necessary parent directories.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory. Use with caution — this is irreversible.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Path to delete' },
        recursive: { type: 'boolean', description: 'Delete directory recursively (required for non-empty dirs)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        source:      { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch the content of a URL. Useful for checking documentation, APIs, or external resources.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        format: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Response format (default: text)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'memory_read',
    description: 'Read a value from persistent memory by key. Use for project-specific context, preferences, or notes persisted across sessions.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key to read' },
      },
      required: ['key'],
    },
  },
  {
    name: 'memory_write',
    description: 'Write a value to persistent memory. Use to remember project context, coding conventions, architecture decisions, etc.',
    input_schema: {
      type: 'object',
      properties: {
        key:   { type: 'string', description: 'Memory key' },
        value: { type: 'string', description: 'Value to store' },
      },
      required: ['key', 'value'],
    },
  },
];

// ─── Dangerous commands that always require confirmation ──────────────────────
export const DANGEROUS_PATTERNS = [
  /rm\s+-rf/,
  /rm\s+-r\b/,
  /rmdir/,
  /\bdel\s+.*\/[sqf]/i,       // Windows del with force/quiet flags
  /rd\s+\/s/i,                 // Windows recursive delete
  />\/dev\/(s?d[a-z])/,
  /mkfs/,
  /dd\s+if=/,
  /chmod\s+777/,
  /\bsudo\b/,
  /\bdoas\b/,
  /\bpkexec\b/,
  /\bsu\s+-c\b/,
  /:\(\)\s*\{.*\}/,            // fork bomb (requires full pattern)
  /curl[^|]+\|\s*(ba)?sh/,     // curl | sh — only block pipe-to-shell
  /wget[^|]+\|\s*(ba)?sh/,     // wget | sh
  /powershell[^;]*-e(nc)?\b/i, // encoded PowerShell
  /\|\s*(ba)?sh\b/,            // pipe to any shell
  /\beval\s+/,
  /format\s+[a-z]:/i,          // Windows format drive
  /\bshutdown\b/i,
  /\breboot\b/i,
];

// Commands considered safe (read-only / informational) — skip confirmation
export const SAFE_COMMAND_PREFIXES = [
  'ls', 'dir', 'cat', 'head', 'tail', 'wc', 'echo', 'pwd', 'whoami',
  'which', 'where', 'type', 'file', 'stat', 'df', 'du',
  'node --version', 'npm --version', 'git status', 'git log', 'git diff',
  'git branch', 'git remote', 'git show', 'git rev-parse',
  'python --version', 'python3 --version', 'pip list', 'pip show',
  'npm list', 'npm ls', 'npm show', 'npm view', 'npx --version',
  'env', 'printenv', 'uname', 'hostname', 'date',
];

export function isDangerous(command) {
  return DANGEROUS_PATTERNS.some(p => p.test(command));
}

export function isSafeCommand(command) {
  const cmd = command.trim().toLowerCase();
  return SAFE_COMMAND_PREFIXES.some(prefix => cmd.startsWith(prefix));
}

// ─── Tool Executor ────────────────────────────────────────────────────────────
export class ToolExecutor {
  constructor({ cwd, memory, onConfirm }) {
    this.cwd       = cwd || process.cwd();
    this.memory    = memory || {};
    this.onConfirm = onConfirm;
  }

  async execute(toolName, params) {
    const start = Date.now();
    try {
      const result = await this._dispatch(toolName, params);
      return { success: true, result, durationMs: Date.now() - start };
    } catch (err) {
      return { success: false, error: err.message, durationMs: Date.now() - start };
    }
  }

  async _dispatch(name, p) {
    switch (name) {
      case 'read_file':         return this.readFile(p);
      case 'write_file':        return this.writeFile(p);
      case 'edit_file':         return this.editFile(p);
      case 'run_command':       return this.runCommand(p);
      case 'list_files':        return this.listFiles(p);
      case 'search_files':      return this.searchFiles(p);
      case 'create_directory':  return this.createDirectory(p);
      case 'delete_file':       return this.deleteFile(p);
      case 'move_file':         return this.moveFile(p);
      case 'web_fetch':         return this.webFetch(p);
      case 'memory_read':       return this.memoryRead(p);
      case 'memory_write':      return this.memoryWrite(p);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ── read_file ──────────────────────────────────────────────────────────────
  async readFile({ path: filePath, start_line, end_line }) {
    const abs  = resolvePath(filePath, this.cwd);
    const stat = await fs.stat(abs);

    if (stat.size > 2 * 1024 * 1024) {
      throw new Error(`File too large (${Math.round(stat.size / 1024)}KB). Use search_files or specify line range.`);
    }

    let content = await fs.readFile(abs, 'utf-8');

    if (start_line || end_line) {
      const lines = content.split('\n');
      const s = (start_line || 1) - 1;
      const e = end_line || lines.length;
      content = lines.slice(s, e).join('\n');
    }

    return content;
  }

  // ── write_file ─────────────────────────────────────────────────────────────
  async writeFile({ path: filePath, content }) {
    const abs = resolvePath(filePath, this.cwd);
    await fs.mkdir(path.dirname(abs), { recursive: true });

    let existed = false;
    let oldContent = '';
    try { 
      oldContent = await fs.readFile(abs, 'utf-8');
      existed = true; 
    } catch {}

    await fs.writeFile(abs, content, 'utf-8');
    
    // Automatically open IDE diff viewer
    openDiffInIDE(abs, oldContent, content).catch(() => {});

    const lines = content.split('\n').length;
    return `${existed ? 'Overwrote' : 'Created'} ${filePath} (${lines} lines)`;
  }

  // ── edit_file ──────────────────────────────────────────────────────────────
  async editFile({ path: filePath, old_string, new_string }) {
    const abs      = resolvePath(filePath, this.cwd);
    const original = await fs.readFile(abs, 'utf-8');

    if (!original.includes(old_string)) {
      throw new Error(
        `old_string not found in ${filePath}. ` +
        `Make sure it matches exactly (including whitespace).`
      );
    }

    const count = original.split(old_string).length - 1;
    if (count > 1) {
      throw new Error(
        `old_string matches ${count} locations in ${filePath}. ` +
        `Use a more specific string that appears exactly once.`
      );
    }

    const updated = original.replace(old_string, new_string);
    await fs.writeFile(abs, updated, 'utf-8');

    // Automatically open IDE diff viewer
    openDiffInIDE(abs, original, updated).catch(() => {});

    const linesBefore = original.split('\n').length;
    const linesAfter  = updated.split('\n').length;
    const delta = linesAfter - linesBefore;
    return `Edited ${filePath} (${delta >= 0 ? '+' : ''}${delta} lines)`;
  }

  // ── run_command ────────────────────────────────────────────────────────────
  async runCommand({ command, cwd: cmdCwd, timeout = 30_000 }) {
    const workDir     = cmdCwd ? resolvePath(cmdCwd, this.cwd) : this.cwd;
    const safeTimeout = Math.min(Math.max(timeout, 1000), 120_000);

    if (isDangerous(command)) {
      throw new Error(
        `Command blocked: "${command}" matches a dangerous pattern. ` +
        `Use a more specific command if you are sure this is safe.`
      );
    }

    try {
      const result = await execaCommand(command, {
        cwd:     workDir,
        shell:   true,
        timeout: safeTimeout,
        reject:  false,
        all:     true,
      });

      const output = result.all    || result.stdout || '';
      const errOut = result.stderr || '';
      const code   = result.exitCode ?? 0;

      return {
        stdout:   output.slice(0, 50_000),
        stderr:   errOut.slice(0, 10_000),
        exitCode: code,
        combined: `${output}${errOut ? '\nSTDERR:\n' + errOut : ''}`.trim().slice(0, 60_000),
      };
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1, combined: err.message };
    }
  }

  // ── list_files ─────────────────────────────────────────────────────────────
  async listFiles({ path: dirPath = '.', recursive = false, pattern, depth = 3 }) {
    const abs         = resolvePath(dirPath, this.cwd);
    const globPattern = pattern || (recursive ? '**/*' : '*');
    const maxDepth    = recursive ? depth : 1;

    const files = await glob(globPattern, {
      cwd:      abs,
      maxDepth,
      dot:      false,
      ignore:   ['**/node_modules/**', '**/.git/**', '**/__pycache__/**', '**/dist/**', '**/.DS_Store'],
    });

    files.sort();
    return files.length > 0 ? files.join('\n') : '(empty directory)';
  }

  // ── search_files ───────────────────────────────────────────────────────────
  async searchFiles({ pattern, path: searchPath = '.', glob: globPat = '**/*', case_insensitive = false, max_results = 50 }) {
    const abs   = resolvePath(searchPath, this.cwd);
    const flags = case_insensitive ? 'gi' : 'g';
    let regex;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }

    const files = await glob(globPat, {
      cwd:      abs,
      maxDepth: 10,
      ignore:   ['**/node_modules/**', '**/.git/**', '**/__pycache__/**', '**/dist/**'],
    });

    const results = [];

    for (const file of files) {
      if (results.length >= max_results) break;

      const filePath = path.join(abs, file);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || stat.size > 1024 * 1024) continue;

        const content = await fs.readFile(filePath, 'utf-8');
        const lines   = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push(`${file}:${i + 1}: ${lines[i].trim().slice(0, 120)}`);
            if (results.length >= max_results) break;
          }
        }
      } catch { /* skip unreadable files */ }
    }

    return results.length > 0 ? results.join('\n') : `No matches found for "${pattern}"`;
  }

  // ── create_directory ───────────────────────────────────────────────────────
  async createDirectory({ path: dirPath }) {
    const abs = resolvePath(dirPath, this.cwd);
    await fs.mkdir(abs, { recursive: true });
    return `Created directory: ${dirPath}`;
  }

  // ── delete_file ────────────────────────────────────────────────────────────
  async deleteFile({ path: filePath, recursive = false }) {
    const abs = resolvePath(filePath, this.cwd);
    await fs.rm(abs, { recursive, force: false });
    return `Deleted: ${filePath}`;
  }

  // ── move_file ──────────────────────────────────────────────────────────────
  async moveFile({ source, destination }) {
    const srcAbs  = resolvePath(source, this.cwd);
    const destAbs = resolvePath(destination, this.cwd);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.rename(srcAbs, destAbs);
    return `Moved ${source} → ${destination}`;
  }

  // ── web_fetch ──────────────────────────────────────────────────────────────
  async webFetch({ url, format = 'text' }) {
    // ── URL validation (SSRF prevention) ──────────────────────────────────
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Block non-HTTP protocols (file://, ftp://, data://, etc.)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Blocked: only http/https URLs are allowed. Got: ${parsed.protocol}`);
    }

    // Block SSRF targets (cloud metadata endpoints, localhost)
    const BLOCKED_HOSTS = [
      '169.254.169.254',          // AWS instance metadata
      '169.254.170.2',            // ECS metadata
      'metadata.google.internal', // GCP metadata
      '100.100.100.200',          // Alibaba Cloud metadata
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
    ];
    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.some(blocked => host === blocked || host.endsWith('.' + blocked))) {
      throw new Error(`Blocked: requests to ${host} are not allowed (SSRF protection).`);
    }

    // Block private IP ranges
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) {
      throw new Error(`Blocked: requests to private IP ranges are not allowed.`);
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'DM-Code/1.3.0 (coding assistant)' },
      signal:  AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const text = await res.text();

    if (format === 'json') {
      try { return JSON.stringify(JSON.parse(text), null, 2).slice(0, 50_000); }
      catch { return text.slice(0, 50_000); }
    }

    // Improved HTML → readable text conversion
    const readable = text
      // Remove script and style blocks entirely
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // Convert common block elements to newlines
      .replace(/<\/?(p|div|section|article|header|footer|main|nav|aside|h[1-6]|li|tr|br)[^>]*>/gi, '\n')
      // Convert links: keep the text + URL
      .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 [$1]')
      // Strip remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, '')
      // Collapse excessive whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 50_000);

    return readable;
  }

  // ── memory_read ────────────────────────────────────────────────────────────
  async memoryRead({ key }) {
    const val = this.memory[key];
    return val !== undefined ? String(val) : `(no memory stored for key: ${key})`;
  }

  // ── memory_write ───────────────────────────────────────────────────────────
  async memoryWrite({ key, value }) {
    this.memory[key] = value;
    return `Stored memory[${key}]`;
  }
}

// ─── Path resolver with sandbox enforcement ───────────────────────────────────
function resolvePath(filePath, cwd) {
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(cwd, filePath);

  const normalizedCwd = path.resolve(cwd) + path.sep;

  // Resolve symlinks before the boundary check — fall back to the lexical
  // path if it doesn't exist yet (e.g. write_file creating a new file).
  let normalizedResolved;
  try {
    normalizedResolved = fsSync.realpathSync(resolved);
  } catch {
    // Path doesn't exist yet — check its parent directory's real path instead
    try {
      const realParent = fsSync.realpathSync(path.dirname(resolved));
      normalizedResolved = path.join(realParent, path.basename(resolved));
    } catch {
      normalizedResolved = path.resolve(resolved); // parent doesn't exist either — let mkdir handle it
    }
  }

  if (
    normalizedResolved !== path.resolve(cwd) &&
    !normalizedResolved.startsWith(normalizedCwd)
  ) {
    throw new Error(
      `Path traversal blocked: "${filePath}" resolves outside the working directory.\n` +
      `  Resolved: ${normalizedResolved}\n` +
      `  Allowed:  ${path.resolve(cwd)}/`
    );
  }

  return resolved;
}

// ─── IDE Diff Viewer Helper ──────────────────────────────────────────────────
async function openDiffInIDE(filePath, oldContent, newContent) {
  try {
    // Save old content to a temporary file
    const tmpName = `dmcode_diff_${Date.now()}_${path.basename(filePath)}`;
    const tmpPath = path.join(os.tmpdir(), tmpName);
    await fs.writeFile(tmpPath, oldContent, 'utf-8');

    // Check for cursor first, then code
    try {
      await execaCommand('cursor -v', { shell: true, timeout: 2000 });
      execaCommand(`cursor --diff "${tmpPath}" "${filePath}"`, { shell: true, detached: true });
      return;
    } catch {}

    try {
      await execaCommand('code -v', { shell: true, timeout: 2000 });
      execaCommand(`code --diff "${tmpPath}" "${filePath}"`, { shell: true, detached: true });
      return;
    } catch {}
  } catch (err) {
    // Silently fail if IDE diff cannot be opened
  }
}
