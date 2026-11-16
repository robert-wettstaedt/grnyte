import { appEndpoint, checkValue } from '$lib/auth/app/endpoint.server'
import { setNewPassword } from '$lib/auth/password/password.server'
import { passwordSchema } from '$lib/forms/schemas'

export const POST = appEndpoint('password/new', {
  auth: 'bearer',
  handler: async ({ password }) => {
    await setNewPassword({ password: await checkValue(passwordSchema, password, 'password') })
    return { ok: true as const }
  },
  profile: 'optional',
})
