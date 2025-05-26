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

export const load = (({ locals }) => {
  if (!checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN])) {
    error(404)
  }
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, request }) => {
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

      // Check if an area with the same slug already exists
      const existingRegion = await db.query.regions.findFirst({ where: eq(regions.name, values.name) })

      if (existingRegion != null) {
        // If an area with the same name exists, return a 400 error with a message
        return fail(400, { ...values, settings, error: `Region with name "${existingRegion.name}" already exists` })
      }

      try {
        // Insert the new region into the database
        await db
          .insert(regions)
          .values({ ...values, settings })
          .returning()
      } catch (exception) {
        // If an error occurs during insertion, return a 400 error with the exception message
        return fail(400, { ...values, settings, error: convertException(exception) })
      }

      return '/config/regions'
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}
