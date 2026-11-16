import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { unlinkProvider } from '$lib/auth/identities.server'

/** Behind an `identity.unlink` grant; never the last way in. */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: async (input) => ({ ok: true as const, ...(await unlinkProvider(input)) }),
  request: V1['identities/unlink'].request,
})
