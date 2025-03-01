import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { convertException } from '$lib/errors'
import { searchResources } from '$lib/search.server'
import { error } from '@sveltejs/kit'

export const GET = async ({ locals, url }) => {
  if (!locals.userPermissions?.includes('data.read')) {
    return new Response(null, { status: 404 })
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    if (locals.user == null) {
      error(404)
    }

    const query = url.searchParams.get('q')

    try {
      const result = await searchResources(query, locals.user, db)

      return new Response(JSON.stringify(result))
    } catch (exception) {
      const error = convertException(exception)
      return new Response(error, { status: 400 })
    }
  })
}
