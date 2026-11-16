import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { startAppFlow } from '$lib/auth/app/handoff.server'
import { V1 } from '$lib/auth/app/v1'

export const POST = appEndpoint({ auth: 'none', handler: startAppFlow, request: V1['oauth/start'].request })
