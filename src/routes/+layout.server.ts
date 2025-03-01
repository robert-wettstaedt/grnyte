import { READ_PERMISSION } from '$lib/auth'
import { getLayoutBlocks } from '$lib/blocks.server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import type { UserSettings } from '$lib/db/schema'

export const load = async ({ locals, cookies }) => {
  const { session, user: authUser } = await locals.safeGetSession()
  const grades = await db.query.grades.findMany()
  const localDb = await createDrizzleSupabaseClient(locals.supabase)
  const blocks = await localDb(async (db) =>
    locals.userPermissions?.includes(READ_PERMISSION) ? await getLayoutBlocks(db) : [],
  )
  const gradingScale: UserSettings['gradingScale'] = locals.user?.userSettings?.gradingScale ?? 'FB'

  return {
    authUser,
    blocks,
    cookies: cookies.getAll(),
    grades,
    gradingScale,
    session,
    user: locals.user,
    userPermissions: locals.userPermissions,
    userRole: locals.userRole,
  }
}
