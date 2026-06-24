// DM Code — Custom Error Types & Handling Utilities

/**
 * Base error class with custom properties
 */
export class DMCodeError extends Error {
  constructor(message, code = 'UNKNOWN', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * API-related errors
 */
export class APIError extends DMCodeError {
  constructor(message, statusCode = null, provider = null) {
    super(message, 'API_ERROR', { statusCode, provider });
    this.statusCode = statusCode;
    this.provider = provider;
  }

  isRateLimit() {
    return this.statusCode === 429 || /rate.?limit|quota|too many/i.test(this.message);
  }

  isServerError() {
    return this.statusCode >= 500 || /server.?error|service.?unavailable/i.test(this.message);
  }

  isAuthError() {
    return this.statusCode === 401 || this.statusCode === 403 || /unauthorized|forbidden|invalid.?key/i.test(this.message);
  }

  isRetryable() {
    return this.isRateLimit() || this.isServerError() || /ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(this.message);
  }
}

/**
 * File system errors
 */
export class FileError extends DMCodeError {
  constructor(message, code = 'FILE_ERROR', path = null) {
    super(message, code, { path });
    this.path = path;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends DMCodeError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR', { field, value });
    this.field = field;
    this.value = value;
  }
}

/**
 * Tool execution errors
 */
export class ToolError extends DMCodeError {
  constructor(toolName, message, originalError = null) {
    super(`${toolName}: ${message}`, 'TOOL_ERROR', { toolName });
    this.toolName = toolName;
    this.originalError = originalError;
  }
}

/**
 * Session errors
 */
export class SessionError extends DMCodeError {
  constructor(message, sessionId = null) {
    super(message, 'SESSION_ERROR', { sessionId });
    this.sessionId = sessionId;
  }
}

/**
 * Configuration errors
 */
export class ConfigError extends DMCodeError {
  constructor(message, key = null) {
    super(message, 'CONFIG_ERROR', { key });
    this.key = key;
  }
}

/**
 * Attempt to retry an async function with exponential backoff
 * @param {function} fn - Async function to retry
 * @param {object} options - { maxRetries, baseDelayMs, maxDelayMs, shouldRetry }
 * @returns {any} Result of function
 * @throws {Error} After all retries exhausted
 */
export async function retryAsync(fn, options = {}) {
  const {
    maxRetries = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const canRetry = shouldRetry ? shouldRetry(error) : true;
      if (!canRetry || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      const exponentialDelay = Math.pow(2, attempt) * baseDelayMs;
      const jitter = Math.random() * 1000;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Create a timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} message - Error message on timeout
 * @returns {Promise} Original promise or timeout error
 */
export function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(message)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Debug helper to log errors with context
 */
export function debugError(error, context = '') {
  if (!process.env.DEBUG) return;

  console.error(`[dmcode] Error ${context || ''}`);
  if (error instanceof DMCodeError) {
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    if (Object.keys(error.details).length > 0) {
      console.error(`  Details:`, error.details);
    }
  } else {
    console.error(`  ${error.message}`);
  }
  if (error.stack && process.env.DEBUG === 'verbose') {
    console.error(error.stack);
  }
}

/**
 * User-friendly error message mapping
 */
export function toUserMessage(error) {
  if (error instanceof APIError) {
    if (error.isAuthError()) {
      return `Authentication failed. Check your API key for ${error.provider || 'this provider'}.`;
    }
    if (error.isRateLimit()) {
      return `Rate limit exceeded. Please wait a few minutes and try again.`;
    }
    if (error.isServerError()) {
      return `Provider is temporarily unavailable. Try a different model or wait a few minutes.`;
    }
    return `API error: ${error.message}`;
  }

  if (error instanceof FileError) {
    return `File operation failed at ${error.path}: ${error.message}`;
  }

  if (error instanceof ValidationError) {
    return `Invalid input${error.field ? ` for ${error.field}` : ''}: ${error.message}`;
  }

  if (error instanceof ToolError) {
    return `Tool ${error.toolName} failed: ${error.message}`;
  }

  return error.message || 'An unknown error occurred.';
}

export default {
  DMCodeError,
  APIError,
  FileError,
  ValidationError,
  ToolError,
  SessionError,
  ConfigError,
  retryAsync,
  withTimeout,
  debugError,
  toUserMessage,
};
