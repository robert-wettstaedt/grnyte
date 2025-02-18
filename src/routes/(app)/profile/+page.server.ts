import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { getUser } from '$lib/helper.server'
import { fail, redirect } from '@sveltejs/kit'

export const load = async ({ locals }) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const user = await getUser(locals.user, db)
    if (user == null) {
      return fail(404)
    }

    redirect(301, `/users/${user.username}`)
  })
}
