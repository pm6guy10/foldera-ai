// =====================================================
// STRUCTURED LOGGING SYSTEM
// Enterprise-grade observability for Foldera
// =====================================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (context) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }

    return entry;
  }

  private output(entry: LogEntry) {
    // In production, you would send this to Axiom, Datadog, LogDNA, etc.
    // For now, we'll use structured console output
    const logString = JSON.stringify(entry, null, this.isDevelopment ? 2 : 0);
    
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logString);
        break;
      case LogLevel.WARN:
        console.warn(logString);
        break;
      case LogLevel.DEBUG:
        if (this.isDevelopment) {
          console.debug(logString);
        }
        break;
      default:
        console.log(logString);
    }
  }

  info(message: string, context?: LogContext) {
    const entry = this.formatLog(LogLevel.INFO, message, context);
    this.output(entry);
  }

  warn(message: string, context?: LogContext) {
    const entry = this.formatLog(LogLevel.WARN, message, context);
    this.output(entry);
  }

  error(message: string, error?: Error, context?: LogContext) {
    const entry = this.formatLog(LogLevel.ERROR, message, context, error);
    this.output(entry);
  }

  debug(message: string, context?: LogContext) {
    const entry = this.formatLog(LogLevel.DEBUG, message, context);
    this.output(entry);
  }
}

// Export singleton instance
export const logger = new Logger();

