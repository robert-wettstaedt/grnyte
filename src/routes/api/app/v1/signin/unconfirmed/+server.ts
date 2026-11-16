import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { refuseCommand } from '$lib/remote/authed.server'
import { signInUnconfirmed } from '../../../../../(landing)/auth/(tabs)/signin/signin.server'

/** The password as entered: the body normalises it and retries as entered. */
export const POST = appEndpoint({
  auth: 'none',
  handler: (input) => signInUnconfirmed(input, refuseCommand),
  request: V1['signin/unconfirmed'].request,
})
