import { db } from '$lib/db/db.server'
import type { UserSettings } from '$lib/db/schema'
import { redirect } from '@sveltejs/kit'

export const load = async ({ locals, cookies, url }) => {
  const { session, user: authUser } = await locals.safeGetSession()
  const grades = await db.query.grades.findMany()
  const gradingScale: UserSettings['gradingScale'] = locals.user?.userSettings?.gradingScale ?? 'FB'

  return {
    authUser,
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
