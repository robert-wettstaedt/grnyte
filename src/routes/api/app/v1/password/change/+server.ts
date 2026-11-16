import { appEndpoint, checkValue } from '$lib/auth/app/endpoint.server'
import { appSession } from '$lib/auth/app/v1'
import { passwordSchema } from '$lib/forms/schemas'
import { refuseCommand } from '$lib/remote/authed.server'
import { changePassword } from '../../../../../(app)/settings/account.server'

/** The admin change ends every session, this one too: the app keeps the answered one. */
export const POST = appEndpoint('password/change', {
  auth: 'bearer',
  handler: async ({ password }) => {
    const value = await checkValue(passwordSchema, password, 'password')
    return { session: appSession(await changePassword({ password: value }, refuseCommand)) }
  },
})
