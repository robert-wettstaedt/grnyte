import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { searchResources } from '$lib/search.server'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, url, parent }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const { user } = await parent()
    const query = url.searchParams.get('q')

    try {
      return await searchResources(query, user, db)
    } catch (error) {
      return
    }
  })
}) satisfies PageServerLoad
