import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { reauthGrantStatus } from '$lib/auth/reauth/reauthSteps.server'

export const GET = appEndpoint('reauth/status', {
  auth: 'bearer',
  handler: async (input) => ({ confirmed: await reauthGrantStatus(input) }),
  profile: 'optional',
})
