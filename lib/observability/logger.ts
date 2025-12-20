type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

function formatLog(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    // JSON format for log aggregators (Datadog, Axiom, etc.)
    return JSON.stringify(entry);
  }
  // Human-readable for development
  const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`;
}

function createLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLog(createLogEntry('debug', message, context)));
    }
  },

  info(message: string, context?: LogContext): void {
    console.log(formatLog(createLogEntry('info', message, context)));
  },

  warn(message: string, context?: LogContext): void {
    console.warn(formatLog(createLogEntry('warn', message, context)));
  },

  error(message: string, context?: LogContext): void {
    console.error(formatLog(createLogEntry('error', message, context)));
  },
};

export type { LogContext, LogLevel };

