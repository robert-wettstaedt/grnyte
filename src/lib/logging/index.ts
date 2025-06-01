import { config } from '../config'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

class Logger {
  private logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }

  constructor(private context?: string) {}

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context)
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (this.logLevels[level] < this.logLevels[config.logging.level]) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        ...(this.context ? { logger: this.context } : {}),
      },
    }

    this.output(entry)
  }

  private output(entry: LogEntry) {
    if (config.logging.format === 'json') {
      console.log(JSON.stringify(entry))
    } else {
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
      console.log(`[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}`)
    }
  }
}

// Create logger instances for different parts of the application
export const apiLogger = new Logger('api')
export const authLogger = new Logger('auth')
export const cacheLogger = new Logger('cache')
export const dbLogger = new Logger('database')
export const errorLogger = new Logger('error')
export const fileLogger = new Logger('file')
