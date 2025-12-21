type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: LogMeta;
  traceId?: string;
}

// Generate trace ID for request tracking
const generateTraceId = (): string => {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

// Current trace context (would use AsyncLocalStorage in production)
let currentTraceId: string | undefined;

export const setTraceId = (traceId?: string): void => {
  currentTraceId = traceId || generateTraceId();
};

export const getTraceId = (): string | undefined => currentTraceId;

const formatLog = (entry: LogEntry): string => {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.traceId ? `[${entry.traceId}]` : '',
    entry.message,
  ].filter(Boolean);
  
  if (entry.meta && Object.keys(entry.meta).length > 0) {
    parts.push(JSON.stringify(entry.meta));
  }
  
  return parts.join(' ');
};

const createLogEntry = (level: LogLevel, message: string, meta?: LogMeta): LogEntry => ({
  timestamp: new Date().toISOString(),
  level,
  message,
  meta,
  traceId: currentTraceId,
});

const shouldLog = (level: LogLevel): boolean => {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  return levels.indexOf(level) >= levels.indexOf(minLevel);
};

export const logger = {
  debug: (message: string, meta?: LogMeta): void => {
    if (shouldLog('debug')) {
      console.debug(formatLog(createLogEntry('debug', message, meta)));
    }
  },
  
  info: (message: string, meta?: LogMeta): void => {
    if (shouldLog('info')) {
      console.log(formatLog(createLogEntry('info', message, meta)));
    }
  },
  
  warn: (message: string, meta?: LogMeta): void => {
    if (shouldLog('warn')) {
      console.warn(formatLog(createLogEntry('warn', message, meta)));
    }
  },
  
  error: (message: string, meta?: LogMeta): void => {
    if (shouldLog('error')) {
      console.error(formatLog(createLogEntry('error', message, meta)));
    }
  },
  
  // Structured logging for specific operations
  operation: (name: string, meta?: LogMeta) => ({
    start: () => logger.info(`${name} started`, meta),
    success: (result?: LogMeta) => logger.info(`${name} completed`, { ...meta, ...result }),
    failure: (error: unknown) => logger.error(`${name} failed`, {
      ...meta,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  }),
};

export default logger;
export type { LogMeta, LogLevel };

