import { handleError } from '$lib/errors'
import { apiLogger, type ResponseContext } from '$lib/logging'
import { error, type Handle } from '@sveltejs/kit'

export const logger: Handle = async ({ event, resolve }) => {
  const start = Date.now()

  try {
    const response = await resolve(event)
    const duration = Date.now() - start

    const responseContext: ResponseContext = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    }

    apiLogger.logRequest('Request completed successfully', event, responseContext, {
      duration,
    })

    return response
  } catch (err) {
    const duration = Date.now() - start

    const responseContext = {
      status: 500,
      error: {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        ...(err instanceof Error && err.stack && { stack: err.stack }),
      },
    }

    apiLogger.logRequest('Request failed', event, responseContext, {
      duration,
    })

    const appError = handleError(err)

    throw error(appError.statusCode, {
      message: appError.message,
    })
  }
}
