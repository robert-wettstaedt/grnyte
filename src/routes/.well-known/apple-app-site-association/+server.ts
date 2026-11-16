import { appleAssociation } from '$lib/auth/app/association.server'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => {
  const body = appleAssociation()
  if (!body) error(404, 'Not found')
  return json(body, { headers: { 'cache-control': 'public, max-age=3600' } })
}
