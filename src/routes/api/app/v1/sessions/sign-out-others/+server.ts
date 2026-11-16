import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { signOutOthers } from '$lib/auth/session.server'

/** No re-authentication, as on the web. */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: async () => {
    await signOutOthers()
    return { ok: true as const }
  },
  profile: 'optional',
  request: V1['sessions/sign-out-others'].request,
})
