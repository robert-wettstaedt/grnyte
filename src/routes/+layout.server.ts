import { getCacheHash } from '$lib/cache/cache.server'
import { config } from '$lib/config'
import { db } from '$lib/db/db.server'
import type { UserSettings } from '$lib/db/schema'

export const load = async ({ locals, cookies }) => {
  const { session, user: authUser } = await locals.safeGetSession()
  const grades = await db.query.grades.findMany()
  const blockHistoryHash = await getCacheHash(config.cache.keys.layoutBlocks)
  const gradingScale: UserSettings['gradingScale'] = locals.user?.userSettings?.gradingScale ?? 'FB'

  return {
    authUser,
    blockHistoryHash,
    cookies: cookies.getAll(),
    grades,
    gradingScale,
    session,
    user: locals.user,
    userPermissions: locals.userPermissions,
    userRole: locals.userRole,
  }
}
