import { config } from '$lib/config'
import { authGuard, supabase } from '$lib/hooks/auth'
import { logger } from '$lib/hooks/logger'
import { rateLimit } from '$lib/hooks/rate-limit'
import { type Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

const handle1: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

  Object.entries(config.cors.headers).forEach(([key, value]) => response.headers.set(key, value))

  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "worker-src 'self' blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "connect-src 'self' https: wss:",
      "img-src 'self' blob: data:",
      "style-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
    ].join('; '),
  )

  return response
}

export const handle: Handle = sequence(rateLimit, supabase, authGuard, logger, handle1)
