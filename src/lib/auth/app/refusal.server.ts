import { formError } from '$lib/forms/schemas'
import { refuseCommand } from '$lib/remote/authed.server'

/** The one answer for every failed OAuth step, whatever the cause. */
export const refuseOAuthFailed = (): never => refuseCommand(formError('auth_oauthFailedBody'))
