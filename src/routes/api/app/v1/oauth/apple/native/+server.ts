import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { signInWithAppleToken } from '$lib/auth/app/handoff.server'

export const POST = appEndpoint('oauth/apple/native', {
  auth: 'none',
  handler: signInWithAppleToken,
})
