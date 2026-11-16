import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { unlinkProvider } from '$lib/auth/methods/identities.server'

export const POST = appEndpoint('identities/unlink', {
  auth: 'bearer',
  handler: async (input) => ({ ok: true as const, ...(await unlinkProvider(input)) }),
})
