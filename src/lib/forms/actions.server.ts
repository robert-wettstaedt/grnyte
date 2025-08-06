import { APP_PERMISSION_ADMIN, checkAppPermission, checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeedLegacy/load.server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { regionMembers, regions } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import {
  regionActionSchema,
  regionMemberActionSchema,
  regionSettingsSchema,
  type ActionFailure,
  type RegionActionValues,
  type RegionMemberActionValues,
  type RegionSettings,
} from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import {
  notifyFirstRoleAdded,
  notifyRoleAdded,
  notifyRoleRemoved,
  notifyRoleUpdated,
} from '$lib/notifications/samples.server'
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { and, count, eq } from 'drizzle-orm'
import { z, ZodError } from 'zod'
import type { Action } from './enhance.server'

export const createRegion = async ({ locals, request }: RequestEvent) => {
  const rls = await createDrizzleSupabaseClient(locals.supabase)

  const returnValue = await rls(async (db) => {
    if (locals.user == null) {
      error(404)
    }

    // Get the form data from the request
    const data = await request.formData()
    let values: RegionActionValues
    let settings: RegionSettings

    try {
      // Validate the form data
      values = await validateFormData(regionActionSchema, data)
      const parsedSettings = JSON.parse(values.settings ?? '{}')
      settings = await z.parseAsync(regionSettingsSchema, parsedSettings)
    } catch (exception) {
      // If validation fails, return the exception as RegionActionFailure
      if (exception instanceof ZodError) {
        return fail(400, { error: convertException(exception) })
      }

      return exception as ActionFailure<RegionActionValues>
    }

    // Check if an area with the same slug already exists
    const existingRegion = await db.query.regions.findFirst({ where: eq(regions.name, values.name) })

    if (existingRegion != null) {
      // If an area with the same name exists, return a 400 error with a message
      return fail(400, { ...values, settings, error: `Region with name "${existingRegion.name}" already exists` })
    }

    try {
      // Insert the new region into the database
      const [region] = await db
        .insert(regions)
        .values({ ...values, createdBy: locals.user.id, settings })
        .returning()

      await db.insert(regionMembers).values({
        authUserFk: locals.user.authUserFk,
        regionFk: region.id,
        role: 'region_admin',
        userFk: locals.user.id,
      })

      return `/settings/regions/${region.id}`
    } catch (exception) {
      // If an error occurs during insertion, return a 400 error with the exception message
      return fail(400, { ...values, settings, error: convertException(exception) })
    }
  })

  if (typeof returnValue === 'string') {
    redirect(303, returnValue)
  }

  return returnValue
}

export const createRegionAction: Action<RegionActionValues> = async (values, db, user) => {
  let settings: RegionSettings

  try {
    const parsedSettings = JSON.parse(values.settings ?? '{}')
    settings = await z.parseAsync(regionSettingsSchema, parsedSettings)
  } catch (exception) {
    error(400, convertException(exception))
  }

  // Check if an area with the same slug already exists
  const existingRegion = await db.query.regions.findFirst({ where: eq(regions.name, values.name) })

  if (existingRegion != null) {
    // If an area with the same name exists, return a 400 error with a message
    return error(400, `Region with name "${existingRegion.name}" already exists`)
  }

  const [region] = await db
    .insert(regions)
    .values({ ...values, createdBy: user.id, settings })
    .returning()

  await db.insert(regionMembers).values({
    authUserFk: user.authUserFk,
    regionFk: region.id,
    role: 'region_admin',
    userFk: user.id,
  })

  return ['', 'settings', 'regions', region.id].join('/')
}

export const updateRegionMember = async (event: RequestEvent) => {
  const { locals, request } = event

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

    if (
      !(
        checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN]) ||
        checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], values.regionId)
      )
    ) {
      error(404)
    }

    const region = await tx.query.regions.findFirst({
      columns: {
        id: true,
        maxMembers: true,
        name: true,
      },
      where: (table, { eq }) => eq(table.id, values.regionId),
    })

    if (region == null) {
      return fail(400, { ...values, error: 'Region not found' })
    }

    const [regionMembers] = await db
      .select({ count: count() })
      .from(schema.regionMembers)
      .where(eq(schema.regionMembers.regionFk, values.regionId))

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

      if (regionMembers.count >= region.maxMembers) {
        return fail(400, {
          ...values,
          error: `This region has reached the maximum number of members (${region.maxMembers})`,
        })
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
}
