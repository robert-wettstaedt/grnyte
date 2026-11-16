import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { confirmEmailChangeCode } from '../../../../../(app)/settings/account.server'

/** No refresh token on this path: `refreshRequired` tells the app to refresh at GoTrue itself. */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: (input) => confirmEmailChangeCode(input, { refresh: false }),
  request: V1['email/confirm'].request,
})
