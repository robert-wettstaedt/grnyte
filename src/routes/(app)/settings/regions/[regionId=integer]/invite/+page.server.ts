import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { convertException } from '$lib/errors'
import { validateFormData } from '$lib/forms/validate.server'
import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit'
import { z } from 'zod/v4'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, params }) => {
  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], Number(params.regionId))) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const region = await db.query.regions.findFirst({
      where: (table, { eq }) => eq(table.id, Number(params.regionId)),
    })

    if (region == null) {
      error(404)
    }

    return { region }
  })
}) satisfies PageServerLoad

export const actions = {
  default: async ({ locals, params, request }) => {
    if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], Number(params.regionId))) {
      error(404)
    }

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      // Get the form data from the request
      const data = await request.formData()
      let values: InviteActionValues

      try {
        // Validate the form data
        values = await validateFormData(inviteSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as RegionActionFailure
        return exception as ActionFailure<InviteActionValues>
      }

      try {
        // await db
        //   .update(regions)
        //   .set({ ...values, settings })
        //   .where(eq(regions.id, Number(params.regionId)))
      } catch (exception) {
        // If an error occurs during insertion, return a 400 error with the exception message
        return fail(400, { ...values, error: convertException(exception) })
      }

      // Redirect to the new area path
      return `/settings/regions/${params.regionId}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}

const inviteSchema = z.object({
  email: z.email(),
})
type InviteActionValues = z.infer<typeof inviteSchema>
