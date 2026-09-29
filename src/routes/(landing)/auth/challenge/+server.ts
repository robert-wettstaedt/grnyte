import { issueChallenge } from '$lib/forms/proofOfWork.server'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () =>
  json(await issueChallenge(), { headers: { 'cache-control': 'no-store' } })
