import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { refuseCommand } from '$lib/remote/authed.server'
import { signInUnconfirmed } from '../../../../../(landing)/auth/(tabs)/signin/signin.server'

/** The password as entered: the body normalises it and retries as entered. */
export const POST = appEndpoint('signin/unconfirmed', {
  auth: 'none',
  handler: (input) => signInUnconfirmed(input, refuseCommand),
})
