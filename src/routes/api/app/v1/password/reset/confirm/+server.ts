import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { withSession } from '$lib/auth/app/v1'
import { confirmResetCode } from '../../../../../../(landing)/auth/forgot-password/forgot-password.server'

export const POST = appEndpoint('password/reset/confirm', {
  auth: 'none',
  handler: async (input) => {
    const { next, session } = await confirmResetCode(input)
    return withSession(next, session)
  },
})
