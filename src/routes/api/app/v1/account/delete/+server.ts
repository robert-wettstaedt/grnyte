import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { deleteOwnAccount } from '../../../../../(app)/settings/account.server'

/** Behind an `account.delete` grant; GoTrue ends every session with the account. */
export const POST = appEndpoint('account/delete', {
  auth: 'bearer',
  handler: async () => {
    await deleteOwnAccount({})
    return { ok: true as const }
  },
})
