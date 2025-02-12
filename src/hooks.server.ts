import { config } from '$lib/config'
import { authGuard, supabase } from '$lib/hooks/auth'
import { logger } from '$lib/hooks/logger'
import { rateLimit } from '$lib/hooks/rate-limit'
import { type Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

const handle1: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

  Object.entries(config.cors.headers).forEach(([key, value]) => response.headers.set(key, value))

  return response
}

export const handle: Handle = sequence(rateLimit, supabase, authGuard, logger, handle1)
