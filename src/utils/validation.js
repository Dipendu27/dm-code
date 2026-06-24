// DM Code — Input Validation & Sanitization Layer
// Prevents security issues like directory traversal and injection attacks

import path from 'path';

/**
 * Validate and sanitize a file path to prevent directory traversal attacks
 * @param {string} filePath - Path to validate
 * @param {string} basePath - Base directory to restrict paths to (optional)
 * @throws {Error} If path is invalid or attempts traversal
 * @returns {string} Absolute, normalized path
 */
export function validateFilePath(filePath, basePath = process.cwd()) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Resolve to absolute path
  const absolutePath = path.resolve(basePath, filePath);
  const realBasePath = path.resolve(basePath);

  // Prevent directory traversal: ensure result starts with base
  if (!absolutePath.startsWith(realBasePath)) {
    throw new Error(`Path traversal detected: ${filePath} attempts to escape base directory`);
  }

  return absolutePath;
}

/**
 * Validate shell command safety
 * @param {string} command - Shell command to validate
 * @returns {object} { safe: boolean, reasons: string[] }
 */
export function validateCommand(command) {
  const reasons = [];

  if (!command || typeof command !== 'string') {
    return { safe: false, reasons: ['Command must be a non-empty string'] };
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    { pattern: /rm\s+-rf/, reason: 'Recursive delete command' },
    { pattern: /rm\s+-r/, reason: 'Recursive delete command' },
    { pattern: /del\s+/i, reason: 'Delete command' },
    { pattern: /rd\s+\/s/i, reason: 'Recursive directory delete' },
    { pattern: />\/dev\/(s?d[a-z])/, reason: 'Disk device access' },
    { pattern: /mkfs/, reason: 'File system formatting' },
    { pattern: /dd\s+if=/, reason: 'Low-level disk operation' },
    { pattern: /chmod\s+777/, reason: 'Dangerous permission change' },
    { pattern: /sudo\s+/, reason: 'Privilege escalation' },
    { pattern: /doas\s+/, reason: 'Privilege escalation' },
    { pattern: /pkexec\s+/, reason: 'Privilege escalation' },
    { pattern: /su\s+-c/, reason: 'Privilege escalation' },
    { pattern: /:\(\)\s*\{/, reason: 'Fork bomb' },
    { pattern: /curl.*\|.*sh/, reason: 'Pipe to shell (code execution)' },
    { pattern: /wget.*\|.*sh/, reason: 'Pipe to shell (code execution)' },
    { pattern: /powershell.*-enc/i, reason: 'Encoded PowerShell (suspicious)' },
    { pattern: /eval\s+/, reason: 'Dynamic code execution' },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(command)) {
      reasons.push(reason);
    }
  }

  return { safe: reasons.length === 0, reasons };
}

/**
 * Validate JSON structure before processing
 * @param {any} data - Data to validate as JSON
 * @param {object} schema - Validation schema (simple check)
 * @returns {boolean} Valid or not
 */
export function validateJSON(data, schema = null) {
  if (!schema) {
    try {
      JSON.stringify(data);
      return true;
    } catch {
      return false;
    }
  }

  // Simple schema validation
  if (schema.type === 'object' && typeof data !== 'object') return false;
  if (schema.type === 'string' && typeof data !== 'string') return false;
  if (schema.type === 'number' && typeof data !== 'number') return false;
  if (schema.type === 'array' && !Array.isArray(data)) return false;

  return true;
}

/**
 * Truncate long strings safely
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string with ellipsis if needed
 */
export function safeTruncate(str, maxLength = 100) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Rate limit check (simple in-memory, per-session)
 */
export class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  isAllowed(key = 'default') {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Clean old entries
    this.requests = this.requests.filter(r => r.timestamp > cutoff);

    // Check limit
    const requestsInWindow = this.requests.filter(r => r.key === key).length;
    if (requestsInWindow >= this.maxRequests) {
      return false;
    }

    // Record request
    this.requests.push({ key, timestamp: now });
    return true;
  }
}

export default { validateFilePath, validateCommand, validateJSON, safeTruncate, RateLimiter };
