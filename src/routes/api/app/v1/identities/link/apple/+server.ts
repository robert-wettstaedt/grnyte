import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { linkAppleToken } from '$lib/auth/app/handoff.server'
import { V1 } from '$lib/auth/app/v1'

export const POST = appEndpoint({
  auth: 'bearer',
  handler: linkAppleToken,
  request: V1['identities/link/apple'].request,
})
