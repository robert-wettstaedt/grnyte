import { errorLogger } from '$lib/logging'
import { isHttpError } from '@sveltejs/kit'
import { ZodError } from 'zod/v4'

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_SERVER_ERROR',
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function handleError(error: unknown): AppError {
  errorLogger.debug('Handling error', {
    errorType: error?.constructor?.name,
    isAppError: error instanceof AppError,
    isError: error instanceof Error,
    message: error instanceof Error ? error.message : String(error),
  })

  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    const appError = new AppError(error.message)
    errorLogger.warn('Converting Error to AppError', {
      originalMessage: error.message,
      stack: error.stack,
    })
    return appError
  }

  const appError = new AppError('An unexpected error occurred')
  errorLogger.error('Converting unknown error to AppError', {
    unknownError: error,
    errorType: typeof error,
  })
  return appError
}

export const convertException = (exception: unknown): string => {
  errorLogger.debug('Converting exception to string', {
    exceptionType: exception?.constructor?.name,
    isHttpError: isHttpError(exception),
    isZodError: exception instanceof ZodError,
    isError: exception instanceof Error,
  })

  if (isHttpError(exception)) {
    const message = exception.body.message
    errorLogger.debug('Converted HTTP error', { message, status: exception.status })
    return message
  }

  if (exception instanceof ZodError) {
    const message = exception.issues
      .map((issue) => {
        if (issue.path.length === 0) {
          return issue.message
        }

        return `'${issue.path.map((item) => String(item).replace(/Fk$/, '')).join('.')}': ${issue.message}`
      })
      .join('\n')

    errorLogger.debug('Converted Zod validation error', {
      issuesCount: exception.issues.length,
      message: message.substring(0, 200), // Truncate for logging
    })
    return message
  }

  if (exception instanceof Error) {
    errorLogger.debug('Converted Error to string', { message: exception.message })
    return exception.message
  }

  const message = String(exception)
  errorLogger.warn('Converted unknown exception to string', {
    exception,
    message,
    exceptionType: typeof exception,
  })
  return message
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export const timeoutFunction = <T>(fn: () => Promise<T>, timeout: number): Promise<T> => {
  errorLogger.debug('Starting timeout function', { timeout })

  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        errorLogger.warn('Function timed out', { timeout })
        reject(new TimeoutError('Timeout'))
      }, timeout),
    ),
  ])
}
