import { appEndpoint, checkValue } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { setNewPassword } from '$lib/auth/password.server'
import { passwordSchema } from '$lib/forms/schemas'

/** After a reset or a contested confirmation, on the code's session (profile not yet made). */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: async ({ password }) => {
    await setNewPassword({ password: await checkValue(passwordSchema, password, 'password') })
    return { ok: true as const }
  },
  profile: 'optional',
  request: V1['password/new'].request,
})
