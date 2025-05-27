import { caches, getCacheHash } from '$lib/cache/cache.server'
import { error } from '@sveltejs/kit'

export const GET = async ({ locals }) => {
  if (locals.userRegions.length === 0) {
    error(404)
  }

  const blockHistoryHash = await getCacheHash(caches.layoutBlocks, locals.userRegions)
  return new Response(blockHistoryHash)
}
