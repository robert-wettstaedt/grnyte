import { startAppleReauth } from '$lib/auth/app/appleReauth.server'
import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'

export const POST = appEndpoint({
  auth: 'bearer',
  handler: startAppleReauth,
  profile: 'optional',
  request: V1['reauth/apple/start'].request,
})
