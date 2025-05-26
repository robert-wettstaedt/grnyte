import { APP_PERMISSION_ADMIN, checkAppPermission } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { regions } from '$lib/db/schema'
import { convertException } from '$lib/errors'
import {
  regionActionSchema,
  regionSettingsSchema,
  type ActionFailure,
  type RegionActionValues,
  type RegionSettings,
} from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { error, fail, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params }) => {
  if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const result = await db.query.regions.findFirst({ where: eq(regions.id, Number(params.regionId)) })

    if (result == null) {
      error(404)
    }

    return {
      region: result,
    }
  })
}) as PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
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
        return exception as ActionFailure<RegionActionValues>
      }

      try {
        await db
          .update(regions)
          .set({ ...values, settings })
          .where(eq(regions.id, Number(params.regionId)))
      } catch (exception) {
        // If an error occurs during insertion, return a 400 error with the exception message
        return fail(400, { ...values, settings, error: convertException(exception) })
      }

      // Redirect to the new area path
      return '/config/regions'
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
