import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import {
  regionMemberActionSchema,
  tagActionSchema,
  validateFormData,
  type ActionFailure,
  type RegionMemberActionValues,
  type TagActionValues,
} from '$lib/forms.server'
import { error, fail } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import type { PageServerLoad } from './$types'
import {
  notifyFirstRoleAdded,
  notifyRoleAdded,
  notifyRoleRemoved,
  notifyRoleUpdated,
} from '$lib/notifications/samples.server'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
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
    const tags = await db.query.tags.findMany({
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
      regionMembers,
      regions,
      tags,
      users: usersWithAuthUsers,
    }
  })
}) satisfies PageServerLoad

export const actions = {
  deleteTag: async ({ locals, request }) => {
    if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      const data = await request.formData()

      let values: TagActionValues

      try {
        // Validate the form data
        values = await validateFormData(tagActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as TagActionFailure
        return exception as ActionFailure<TagActionValues>
      }

      try {
        await db.delete(schema.tags).where(eq(schema.tags.id, values.id))
        await db.delete(schema.routesToTags).where(eq(schema.routesToTags.tagFk, values.id))
      } catch (exception) {
        return fail(400, { ...values, error: convertException(exception) })
      }
    })
  },

  updateRegionMember: async (event) => {
    const { locals, request } = event
    if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    return await rls(async (db) => {
      if (locals.user == null) {
        return fail(400)
      }

      const data = await request.formData()

      let values: RegionMemberActionValues

      try {
        // Validate the form data
        values = await validateFormData(regionMemberActionSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as TagActionFailure
        return exception as ActionFailure<RegionMemberActionValues>
      }

      const region = await db.query.regions.findFirst({
        columns: {
          id: true,
          name: true,
        },
        where: (table, { eq }) => eq(table.id, values.regionId),
      })

      if (region == null) {
        return fail(400, { ...values, error: 'Region not found' })
      }

      const user = await db.query.users.findFirst({
        where: (table, { eq }) => eq(table.id, values.userId),
        columns: {
          authUserFk: true,
        },
      })

      if (user == null) {
        return fail(400, { ...values, error: 'User not found' })
      }

      const existingMemberships = await db.query.regionMembers.findMany({
        where: (table, { eq }) => and(eq(table.userFk, values.userId)),
      })
      const existingRegionMembership = existingMemberships.find((membership) => membership.regionFk === values.regionId)

      if (values.role == null) {
        await db
          .delete(schema.regionMembers)
          .where(
            and(eq(schema.regionMembers.userFk, values.userId), eq(schema.regionMembers.regionFk, values.regionId)),
          )

        await notifyRoleRemoved(event, {
          authUserFk: user.authUserFk,
          regionName: region.name,
        })

        await insertActivity(db, {
          columnName: 'role',
          entityId: String(values.userId),
          entityType: 'user',
          regionFk: region.id,
          type: 'deleted',
          userFk: locals.user.id,
        })

        return
      }

      if (existingRegionMembership != null) {
        await db
          .update(schema.regionMembers)
          .set({ role: values.role })
          .where(
            and(eq(schema.regionMembers.userFk, values.userId), eq(schema.regionMembers.regionFk, values.regionId)),
          )

        await notifyRoleUpdated(event, {
          authUserFk: user.authUserFk,
          regionName: region.name,
          role: schema.appRoleLabels[values.role],
        })

        await insertActivity(db, {
          columnName: 'role',
          entityId: String(values.userId),
          entityType: 'user',
          oldValue: schema.appRoleLabels[existingRegionMembership.role],
          newValue: schema.appRoleLabels[values.role],
          regionFk: region.id,
          type: 'updated',
          userFk: locals.user.id,
        })

        return
      }

      await db.insert(schema.regionMembers).values({
        authUserFk: user.authUserFk,
        regionFk: values.regionId,
        role: values.role,
        userFk: values.userId,
      })

      if (existingMemberships.length === 0) {
        await notifyFirstRoleAdded(event, {
          authUserFk: user.authUserFk,
          regionName: region.name,
        })
      } else {
        await notifyRoleAdded(event, {
          authUserFk: user.authUserFk,
          regionName: region.name,
        })
      }

      await insertActivity(db, {
        columnName: 'role',
        entityId: String(values.userId),
        entityType: 'user',
        regionFk: region.id,
        type: 'created',
        userFk: locals.user.id,
      })
    })
  },
}
