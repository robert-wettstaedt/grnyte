import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { withSession } from '$lib/auth/app/v1'
import { confirmEmailChangeCode } from '../../../../../(app)/settings/account.server'

export const POST = appEndpoint('email/confirm', {
  auth: 'bearer',
  handler: async (input) => {
    const answer = await confirmEmailChangeCode(input, { refresh: false })
    return withSession(answer.step, answer.session)
  },
})
