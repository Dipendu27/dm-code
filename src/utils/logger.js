// DM Code — Logging Utility
// Provides structured logging with DEBUG support

import chalk from 'chalk';

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

/**
 * Logger class for structured output
 */
export class Logger {
  constructor(namespace = 'dmcode', level = process.env.DEBUG ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO) {
    this.namespace = namespace;
    this.level = level;
  }

  _format(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.namespace}/${level}]`;

    let output = prefix;
    if (message) output += ` ${message}`;
    if (data && Object.keys(data).length > 0) {
      output += ` ${JSON.stringify(data)}`;
    }

    return output;
  }

  error(message, data) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(chalk.red(this._format('ERROR', message, data)));
    }
  }

  warn(message, data) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(chalk.yellow(this._format('WARN', message, data)));
    }
  }

  info(message, data) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(chalk.blue(this._format('INFO', message, data)));
    }
  }

  debug(message, data) {
    if (this.level >= LOG_LEVELS.DEBUG && process.env.DEBUG) {
      console.log(chalk.gray(this._format('DEBUG', message, data)));
    }
  }

  trace(message, data) {
    if (this.level >= LOG_LEVELS.TRACE && process.env.DEBUG === 'verbose') {
      console.log(chalk.dim(this._format('TRACE', message, data)));
    }
  }

  /**
   * Log timing of operations
   */
  time(label) {
    return {
      end: (message, extra) => {
        const duration = Date.now() - label._startTime;
        this.debug(message, { durationMs: duration, ...extra });
      },
      _startTime: Date.now(),
    };
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger('dmcode');

/**
 * Create a child logger with a different namespace
 */
export function createLogger(namespace) {
  return new Logger(namespace);
}

export default { Logger, logger, createLogger };
