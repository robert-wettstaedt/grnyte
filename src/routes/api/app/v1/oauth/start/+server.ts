import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { startAppFlow } from '$lib/auth/app/handoff.server'

export const POST = appEndpoint('oauth/start', { auth: 'none', handler: startAppFlow })
