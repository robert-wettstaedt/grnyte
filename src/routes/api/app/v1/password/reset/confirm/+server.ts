import { getRequestEvent } from '$app/server'
import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { appSession, V1 } from '$lib/auth/app/v1'
import { holdCodeSession } from '$lib/auth/contested.server'
import { confirmResetCode } from '../../../../../../(landing)/auth/forgot-password/forgot-password.server'

export const POST = appEndpoint({
  auth: 'none',
  handler: async (input) => {
    const { locals } = getRequestEvent()
    const held = await holdCodeSession(locals.supabase, await confirmResetCode(input), 'choosePassword')
    return { next: held.next, ...(held.session == null ? {} : { session: appSession(held.session) }) }
  },
  request: V1['password/reset/confirm'].request,
})
