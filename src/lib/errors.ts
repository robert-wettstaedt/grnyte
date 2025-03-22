import { isHttpError } from '@sveltejs/kit'
import { ZodError } from 'zod'

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
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    return new AppError(error.message)
  }

  return new AppError('An unexpected error occurred')
}

export const convertException = (exception: unknown): string => {
  if (isHttpError(exception)) {
    return exception.body.message
  }

  if (exception instanceof ZodError) {
    return exception.issues
      .map((issue) => {
        if (issue.path.length === 0) {
          return issue.message
        }

        return `'${issue.path.map((item) => String(item).replace(/Fk$/, '')).join('.')}': ${issue.message}`
      })
      .join('\n')
  }

  if (exception instanceof Error) {
    return exception.message
  }

  return String(exception)
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export const timeoutFunction = <T>(fn: () => Promise<T>, timeout: number): Promise<T> => {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new TimeoutError('Timeout')), timeout)),
  ])
}
