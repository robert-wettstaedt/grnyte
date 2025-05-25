import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import {
  regionMemberActionSchema,
  tagActionSchema,
  type ActionFailure,
  type RegionMemberActionValues,
  type TagActionValues,
} from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import {
  notifyFirstRoleAdded,
  notifyRoleAdded,
  notifyRoleRemoved,
  notifyRoleUpdated,
} from '$lib/notifications/samples.server'
import { error, fail } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
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

    return await rls(async (tx) => {
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

      const region = await tx.query.regions.findFirst({
        columns: {
          id: true,
          name: true,
        },
        where: (table, { eq }) => eq(table.id, values.regionId),
      })

      if (region == null) {
        return fail(400, { ...values, error: 'Region not found' })
      }

      const user = await tx.query.users.findFirst({
        where: (table, { eq }) => eq(table.id, values.userId),
        columns: {
          authUserFk: true,
        },
      })

      if (user == null) {
        return fail(400, { ...values, error: 'User not found' })
      }

      const existingMemberships = await tx.query.regionMembers.findMany({
        where: (table, { eq }) => and(eq(table.userFk, values.userId)),
      })
      const existingRegionMembership = existingMemberships.find((membership) => membership.regionFk === values.regionId)

      try {
        if (values.role == null) {
          await tx
            .delete(schema.regionMembers)
            .where(
              and(eq(schema.regionMembers.userFk, values.userId), eq(schema.regionMembers.regionFk, values.regionId)),
            )

          await insertActivity(db, {
            columnName: 'role',
            entityId: String(values.userId),
            entityType: 'user',
            regionFk: region.id,
            type: 'deleted',
            userFk: locals.user.id,
          })

          await notifyRoleRemoved(event, {
            authUserFk: user.authUserFk,
            regionName: region.name,
          })

          return
        }

        if (existingRegionMembership != null) {
          await tx
            .update(schema.regionMembers)
            .set({ role: values.role })
            .where(
              and(eq(schema.regionMembers.userFk, values.userId), eq(schema.regionMembers.regionFk, values.regionId)),
            )

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

          await notifyRoleUpdated(event, {
            authUserFk: user.authUserFk,
            regionName: region.name,
            role: schema.appRoleLabels[values.role],
          })

          return
        }

        await tx.insert(schema.regionMembers).values({
          authUserFk: user.authUserFk,
          regionFk: values.regionId,
          role: values.role,
          userFk: values.userId,
        })

        await insertActivity(db, {
          columnName: 'role',
          entityId: String(values.userId),
          entityType: 'user',
          regionFk: region.id,
          type: 'created',
          userFk: locals.user.id,
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
      } catch (exception) {
        return fail(400, { ...values, error: convertException(exception) })
      }
    })
  },
}
