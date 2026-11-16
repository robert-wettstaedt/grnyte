import { startAppleReauth } from '$lib/auth/app/appleReauth.server'
import { appEndpoint } from '$lib/auth/app/endpoint.server'

export const POST = appEndpoint('reauth/apple/start', {
  auth: 'bearer',
  handler: startAppleReauth,
  profile: 'optional',
})
