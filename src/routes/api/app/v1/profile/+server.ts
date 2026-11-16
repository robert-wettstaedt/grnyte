import { appEndpoint, checkValue } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { usernameSchema } from '$lib/forms/schemas'
import { completeProfile } from '../../../../(landing)/auth/profile/profile.server'

export const POST = appEndpoint({
  auth: 'bearer',
  handler: async ({ gradingScale, username }) => {
    await completeProfile({ gradingScale, username: await checkValue(usernameSchema, username, 'username') })
    return { ok: true as const }
  },
  profile: 'optional',
  request: V1.profile.request,
})
