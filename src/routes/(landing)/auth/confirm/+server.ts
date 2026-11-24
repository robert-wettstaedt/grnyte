import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// No mail links here since the code templates (harden-auth-codes decision 14): an old link has expired.
export const GET: RequestHandler = () => redirect(303, resolve('/(landing)/auth/error'))
