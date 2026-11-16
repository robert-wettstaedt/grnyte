import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { exchangeAppFlow } from '$lib/auth/app/handoff.server'
import { V1 } from '$lib/auth/app/v1'

export const POST = appEndpoint({ auth: 'none', handler: exchangeAppFlow, request: V1['oauth/exchange'].request })
