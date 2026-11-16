import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { issueChallenge } from '$lib/forms/proofOfWork.server'

/** The proof-of-work challenge inside the frozen prefix; the web keeps `/auth/challenge`. */
export const GET = appEndpoint({ auth: 'none', handler: () => issueChallenge(), request: V1.challenge.request })
