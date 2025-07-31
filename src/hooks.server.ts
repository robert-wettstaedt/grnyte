import { authGuard, supabase } from '$lib/hooks/auth'
import { logger } from '$lib/hooks/logger'
import { rateLimit } from '$lib/hooks/rate-limit'
import { splash } from '$lib/hooks/splash'
import { type Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

export const handle: Handle = sequence(splash, rateLimit, supabase, authGuard, logger)
