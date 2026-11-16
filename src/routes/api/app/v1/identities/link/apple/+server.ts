import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { linkAppleToken } from '$lib/auth/app/handoff.server'

export const POST = appEndpoint('identities/link/apple', {
  auth: 'bearer',
  handler: linkAppleToken,
})
