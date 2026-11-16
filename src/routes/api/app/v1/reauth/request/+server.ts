import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { requestReauthCode } from '$lib/auth/reauth/reauthSteps.server'

export const POST = appEndpoint('reauth/request', {
  auth: 'bearer',
  handler: requestReauthCode,
  profile: 'optional',
})
