import { resolve } from '$app/paths'
import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// Only the retired /auth/confirm sent people here; a password is now reset by code.
export const GET: RequestHandler = () => redirect(303, resolve('/(landing)/auth/forgot-password'))
