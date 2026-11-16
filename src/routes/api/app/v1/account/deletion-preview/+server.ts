import { appEndpoint } from '$lib/auth/app/endpoint.server'
import { V1 } from '$lib/auth/app/v1'
import { accountDeletionPreview } from '../../../../../(app)/settings/account.server'

export const GET = appEndpoint({
  auth: 'bearer',
  handler: () => accountDeletionPreview(),
  profile: 'optional',
  request: V1['account/deletion-preview'].request,
})
