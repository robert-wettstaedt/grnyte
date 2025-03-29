import { READ_PERMISSION } from '$lib/auth'
import { getLayoutBlocks } from '$lib/blocks.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { error, json } from '@sveltejs/kit'

export const GET = async ({ locals }) => {
  if (!locals.userPermissions?.includes(READ_PERMISSION)) {
    error(404)
  }

  const localDb = await createDrizzleSupabaseClient(locals.supabase)
  const blocks = await localDb(async (db) =>
    locals.userPermissions?.includes(READ_PERMISSION) ? await getLayoutBlocks(db) : [],
  )

  return json({ blocks })
}
