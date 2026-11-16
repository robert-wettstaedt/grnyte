import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { signInMethodsQuery } from '$lib/auth/identities.server'

export const GET = appEndpoint({
  auth: 'bearer',
  handler: () => signInMethodsQuery(),
  request: V1['sign-in-methods'].request,
})
