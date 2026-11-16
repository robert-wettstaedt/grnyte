import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { appSession, V1 } from '$lib/auth/app/v1'
import { confirmEmailChangeCode } from '../../../../../(app)/settings/account.server'

/** The web's `step` as `next`, and the code's fresh session once the change applied. */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: async (input) => {
    const answer = await confirmEmailChangeCode(input, { refresh: false })
    return answer.session == null ? { next: answer.step } : { next: answer.step, session: appSession(answer.session) }
  },
  request: V1['email/confirm'].request,
})
