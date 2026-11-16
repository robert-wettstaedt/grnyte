import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { accountDeletionPreview } from '../../../../../(app)/settings/account.server'

export const GET = appEndpoint('account/deletion-preview', {
  auth: 'bearer',
  handler: () => accountDeletionPreview(),
})
