import { caches, getCacheHash } from '$lib/cache/cache.server'
import { db } from '$lib/db/db.server'
import type { UserSettings } from '$lib/db/schema'

export const load = async ({ locals, cookies }) => {
  const { session, user: authUser } = await locals.safeGetSession()
  const grades = await db.query.grades.findMany()
  const blockHistoryHash = await getCacheHash(caches.layoutBlocks, locals.userRegions)
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
    userRegions: locals.userRegions,
    userRole: locals.userRole,
  }
}
