import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { signOutOthers } from '$lib/auth/session.server'

export const POST = appEndpoint('sessions/sign-out-others', {
  auth: 'bearer',
  handler: async () => {
    await signOutOthers()
    return { ok: true as const }
  },
  profile: 'optional',
})
