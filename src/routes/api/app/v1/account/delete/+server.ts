import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { deleteOwnAccount } from '../../../../../(app)/settings/account.server'

/** Behind an `account.delete` grant; GoTrue ends every session with the account. */
export const POST = appEndpoint({
  auth: 'bearer',
  handler: async () => {
    await deleteOwnAccount({})
    return { ok: true as const }
  },
  profile: 'optional',
  request: V1['account/delete'].request,
})
