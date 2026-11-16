import { handleMutate } from '$lib/zero/server/mutate.server'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = ({ request }) => handleMutate(request)
