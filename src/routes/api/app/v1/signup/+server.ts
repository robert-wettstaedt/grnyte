import { appEndpoint, checkValue } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { PROOF_OF_WORK_FIELD } from '$lib/forms/botCheck'
import { passwordSchema } from '$lib/forms/schemas'
import { refuseCommand } from '$lib/remote/authed.server'
import { signUp } from '../../../../(landing)/auth/(tabs)/signup/signup.server'

export const POST = appEndpoint({
  auth: 'none',
  handler: async ({ email, password, proofOfWork }) => {
    const value = await checkValue(passwordSchema, password, 'password')
    const { resendToken } = await signUp({ email, password: value, [PROOF_OF_WORK_FIELD]: proofOfWork }, refuseCommand)
    return { ok: true as const, resendToken }
  },
  request: V1.signup.request,
})
