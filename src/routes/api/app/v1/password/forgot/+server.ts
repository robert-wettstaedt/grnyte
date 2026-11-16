import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { PROOF_OF_WORK_FIELD } from '$lib/forms/botCheck'
import { refuseCommand } from '$lib/remote/authed.server'
import { forgotPassword } from '../../../../../(landing)/auth/forgot-password/forgot-password.server'

/** Every branch answers alike. */
export const POST = appEndpoint('password/forgot', {
  auth: 'none',
  handler: async ({ email, proofOfWork }) => {
    await forgotPassword({ email, [PROOF_OF_WORK_FIELD]: proofOfWork }, refuseCommand)
    return { ok: true as const }
  },
})
