import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { signInMethodsQuery } from '$lib/auth/methods/identities.server'

export const GET = appEndpoint('sign-in-methods', {
  auth: 'bearer',
  handler: () => signInMethodsQuery(),
})
