import { appEndpoint, checkValue } from '$lib/auth/app/endpoint.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { changeEmail } from '../../../../../(app)/settings/account.server'

/** A taken address answers as a free one. */
export const POST = appEndpoint('email/change', {
  auth: 'bearer',
  handler: async ({ email }) => {
    await changeEmail(await checkValue(z.email({ error: formError('form_required') }), email, 'email'), refuseCommand)
    return { ok: true as const }
  },
})
