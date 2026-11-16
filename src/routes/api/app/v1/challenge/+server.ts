import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { issueChallenge } from '$lib/forms/bot/proofOfWork.server'

export const GET = appEndpoint('challenge', {
  auth: 'none',
  handler: async () => {
    const challenge = await issueChallenge()
    return { ...challenge, parameters: { ...challenge.parameters } }
  },
})
