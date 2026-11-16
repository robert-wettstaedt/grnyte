import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { reauthGrantStatus } from '$lib/auth/reauthSteps.server'

export const GET = appEndpoint({
  auth: 'bearer',
  handler: async (input) => ({ confirmed: await reauthGrantStatus(input) }),
  profile: 'optional',
  request: V1['reauth/status'].request,
})
