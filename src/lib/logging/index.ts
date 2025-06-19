import type { RequestEvent } from '@sveltejs/kit'
import { config } from '../config'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: Record<string, unknown>
}

interface RequestContext {
  request: {
    headers?: Record<string, string>
    ip?: string
    method: string
    params?: Partial<Record<string, string>>
    path: string
    query?: Record<string, string>
    userAgent?: string
  }
  user: {
    id?: number
    name?: string
    permissions?: App.Locals['userPermissions']
    regions?: string[]
    role?: App.Locals['userRole']
  }
}

export interface ResponseContext {
  status: number
  statusText?: string
  headers?: Record<string, string>
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
}

interface Context {
  request: RequestContext['request']
  user: RequestContext['user']
  response?: ResponseContext
  additionalContext?: Record<string, unknown>
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

  /**
   * Logs a complete request/response cycle with comprehensive context
   */
  logRequest(
    message: string,
    event: RequestEvent,
    responseContext?: ResponseContext,
    additionalContext?: Record<string, unknown>,
  ) {
    const requestContext = extractRequestContext(event)

    const context: Context = {
      request: requestContext.request,
      user: requestContext.user,
      response: responseContext,
      additionalContext,
    }

    this.log('info', message, context as unknown as Record<string, unknown>)
  }

  /**
   * Logs an error with enhanced context
   */
  logError(message: string, error: unknown, context?: Record<string, unknown>) {
    const errorContext: Record<string, unknown> = {
      error: {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
      },
    }

    if (error instanceof Error && error.stack) {
      ;(errorContext.error as Record<string, unknown>).stack = error.stack
    }
    if (error && typeof error === 'object' && 'code' in error) {
      ;(errorContext.error as Record<string, unknown>).code = (error as any).code
    }

    if (context) {
      Object.assign(errorContext, context)
    }

    this.log('error', message, errorContext)
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (this.logLevels[level] < this.logLevels[config.logging.level]) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    }

    entry.context = {
      ...(this.context ? { logger: this.context } : {}),
    }

    if (context) {
      Object.assign(entry.context, context)
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

// Utility function to extract safe request context from SvelteKit event
export function extractRequestContext(event: RequestEvent): RequestContext {
  const url = new URL(event.request.url)

  // Extract headers but exclude sensitive ones
  const headers = Object.fromEntries(event.request.headers.entries())
  const safeHeaders: Record<string, string> = {}

  // Only include non-sensitive headers
  const safeHeaderKeys = [
    'accept',
    'accept-encoding',
    'accept-language',
    'cache-control',
    'content-type',
    'dnt',
    'origin',
    'referer',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'user-agent',
    'x-forwarded-for',
    'x-real-ip',
  ]

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (safeHeaderKeys.includes(lowerKey)) {
      safeHeaders[key] = value
    }
  }

  return {
    request: {
      headers: safeHeaders,
      ip: event.getClientAddress?.(),
      method: event.request.method,
      params: event.params,
      path: event.url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      userAgent: event.request.headers.get('user-agent') || undefined,
    },
    user: {
      id: event.locals.user?.id,
      name: event.locals.user?.username,
      permissions: event.locals.userPermissions,
      regions: event.locals.userRegions.map((region) => region.name),
      role: event.locals.userRole,
    },
  }
}
