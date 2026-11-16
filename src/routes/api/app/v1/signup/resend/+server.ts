import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { PROOF_OF_WORK_FIELD } from '$lib/forms/botCheck'
import { refuseCommand } from '$lib/remote/authed.server'
import { resendSignupCode } from '../../../../../(landing)/auth/(tabs)/signup/signup.server'

export const POST = appEndpoint({
  auth: 'none',
  handler: async ({ email, proofOfWork, resendToken }) => {
    await resendSignupCode({ email, [PROOF_OF_WORK_FIELD]: proofOfWork, resendToken }, refuseCommand)
    return { ok: true as const }
  },
  request: V1['signup/resend'].request,
})
