import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { confirmReauthCode } from '$lib/auth/reauthSteps.server'

/** Confirms only; the action runs from its own endpoint. */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: async (input) => ({ confirmed: (await confirmReauthCode(input)).confirmed as true }),
  profile: 'optional',
  request: V1['reauth/confirm'].request,
})
