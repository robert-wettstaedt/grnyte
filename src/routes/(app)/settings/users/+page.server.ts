import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import { updateRegionMember } from '$lib/forms/actions.server'
import { error } from '@sveltejs/kit'
import { authUsers } from 'drizzle-orm/supabase'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals }) => {
  if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)
  const authUsersResult = await db.select({ id: authUsers.id, email: authUsers.email }).from(authUsers)

  return await rls(async (db) => {
    const regionMembers = await db.query.regionMembers.findMany()
    const regions = await db.query.regions.findMany({
      orderBy: (table, { asc }) => [asc(table.id)],
    })
    const users = await db.query.users.findMany({
      orderBy: (table, { asc }) => [asc(table.id)],
    })

    const usersWithAuthUsers = users.map((user) => ({
      ...user,
      email: authUsersResult.find((authUser) => authUser.id === user.authUserFk)?.email,
    }))

    return {
      regionMembers: regionMembers.map((regionMember) => ({
        ...regionMember,
        user: usersWithAuthUsers.find((user) => user.id === regionMember.userFk),
      })),
      regions,
      users: usersWithAuthUsers,
    }
  })
  // @ts-expect-error fix for missing z
}) satisfies PageServerLoad

export const actions = {
  updateRegionMember,
}
