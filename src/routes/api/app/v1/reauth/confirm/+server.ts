import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { confirmReauthCode } from '$lib/auth/reauth/reauthSteps.server'

export const POST = appEndpoint('reauth/confirm', {
  auth: 'bearer',
  handler: confirmReauthCode,
  profile: 'optional',
})
