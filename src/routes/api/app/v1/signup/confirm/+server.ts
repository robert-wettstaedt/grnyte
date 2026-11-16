import { getRequestEvent } from '$app/server'
import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { appSession, V1 } from '$lib/auth/app/v1'
import { holdCodeSession } from '$lib/auth/contested.server'
import { confirmSignupCode } from '../../../../../(landing)/auth/(tabs)/signup/signup.server'

/** The hook's in-memory client holds the code's session, so a contested password is replaced as on the web. */
export const POST = appEndpoint({
  auth: 'none',
  handler: async (input) => {
    const held = await holdCodeSession(getRequestEvent().locals.supabase, await confirmSignupCode(input), 'profile')
    return { next: held.next, ...(held.session == null ? {} : { session: appSession(held.session) }) }
  },
  request: V1['signup/confirm'].request,
})
