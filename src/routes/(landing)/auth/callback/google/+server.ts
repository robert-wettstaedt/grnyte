import { completeOAuth } from '$lib/auth/oauth/flow.server'
import type { RequestHandler } from './$types'

/** Registered at Google: never move it. The literal folder pins the provider. */
export const GET: RequestHandler = (event) => completeOAuth(event, 'google')
