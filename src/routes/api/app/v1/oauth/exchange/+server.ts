import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { exchangeAppFlow } from '$lib/auth/app/handoff.server'

export const POST = appEndpoint('oauth/exchange', { auth: 'none', handler: exchangeAppFlow })
