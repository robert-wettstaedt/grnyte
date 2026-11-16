import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { requestReauthCode } from '$lib/auth/reauthSteps.server'

export const POST = appEndpoint({
  auth: 'bearer',
  handler: requestReauthCode,
  profile: 'optional',
  request: V1['reauth/request'].request,
})
