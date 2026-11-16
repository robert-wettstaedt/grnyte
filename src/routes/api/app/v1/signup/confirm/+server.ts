import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { withSession } from '$lib/auth/app/v1'
import { confirmSignupCode } from '../../../../../(landing)/auth/(tabs)/signup/signup.server'

/** The hook's in-memory client holds the code's session, so a contested password is replaced as on the web. */
export const POST = appEndpoint('signup/confirm', {
  auth: 'none',
  handler: async (input) => {
    const { next, session } = await confirmSignupCode(input)
    return withSession(next, session)
  },
})
