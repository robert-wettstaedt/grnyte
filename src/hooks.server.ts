import { authGuard, supabase } from '$lib/hooks/auth.server'
import { rateLimit } from '$lib/hooks/rate-limit.server'
import { type Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

export const handle: Handle = sequence(rateLimit, supabase, authGuard)
