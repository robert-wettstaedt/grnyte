import { confirmAppleReauth } from '$lib/auth/app/appleReauth.server'
import { appEndpoint } from '$lib/auth/app/endpoint.server'

export const POST = appEndpoint('reauth/apple/confirm', {
  auth: 'bearer',
  handler: confirmAppleReauth,
  profile: 'optional',
})
