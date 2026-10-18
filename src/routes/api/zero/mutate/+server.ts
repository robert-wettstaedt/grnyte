import { handleMutate } from '$lib/zero/mutate.server'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = ({ request }) => handleMutate(request)
