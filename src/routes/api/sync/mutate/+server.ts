import { handleSyncMutate } from '$lib/zero/server/syncMutate.server'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = ({ request }) => handleSyncMutate(request)
