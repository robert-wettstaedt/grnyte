import {
  APP_PERMISSION_ADMIN,
  checkAppPermission,
  checkRegionPermission,
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_READ,
} from '$lib/auth'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import { updateRegionMember } from '$lib/forms/actions.server'
import { error, fail, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { z } from 'zod'
import { validateFormData } from '$lib/forms/validate.server'
import type { ActionFailure } from '$lib/forms/schemas'
import * as schema from '$lib/db/schema'
import { eq } from 'drizzle-orm'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'

export const load = (async ({ locals, params }) => {
  if (!checkRegionPermission(locals.userRegions, [REGION_PERMISSION_READ], Number(params.regionId))) {
    error(404)
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const region = await db.query.regions.findFirst({
      where: (table, { eq }) => eq(table.id, Number(params.regionId)),
    })

    const regionMembers = await db.query.regionMembers.findMany({
      where: (table, { eq }) => eq(table.regionFk, Number(params.regionId)),
      with: {
        invitedBy: true,
        user: true,
      },
    })

    const regionInvitations = await db.query.regionInvitations.findMany({
      where: (table, { and, eq }) => and(eq(table.regionFk, Number(params.regionId)), eq(table.status, 'pending')),
      with: {
        invitedBy: true,
      },
    })

    if (region == null) {
      error(404)
    }

    return { region, regionMembers, regionInvitations }
  })
  // @ts-expect-error fix for missing z
}) satisfies PageServerLoad

export const actions = {
  updateRegionMember,

  removeRegionInvitation: async (event) => {
    const { locals, params, request } = event

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        error(404)
      }

      // Get the form data from the request
      const data = await request.formData()
      let values: RemoveRegionInvitationSchema

      try {
        // Validate the form data
        values = await validateFormData(removeRegionInvitationSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as RegionActionFailure
        return exception as ActionFailure<RemoveRegionInvitationSchema>
      }

      const invitation = await db.query.regionInvitations.findFirst({
        where: (table, { and, eq }) => and(eq(table.id, values.invitationId), eq(table.regionFk, values.regionId)),
        with: {
          invitedBy: true,
        },
      })

      if (invitation == null) {
        return fail(404, { ...values, message: 'Invitation not found' })
      }

      if (
        !(
          checkAppPermission(locals.userPermissions, [APP_PERMISSION_ADMIN]) ||
          checkRegionPermission(locals.userRegions, [REGION_PERMISSION_ADMIN], Number(params.regionId)) ||
          invitation.invitedBy.authUserFk === locals.user.authUserFk
        )
      ) {
        return fail(401, { ...values, error: 'You are not authorized to remove this invitation' })
      }

      await db
        .update(schema.regionInvitations)
        .set({ status: 'expired' })
        .where(eq(schema.regionInvitations.id, values.invitationId))

      await insertActivity(db, {
        columnName: 'invitation',
        entityId: String(locals.user.id),
        entityType: 'user',
        newValue: invitation.email,
        regionFk: Number(params.regionId),
        type: 'deleted',
        userFk: locals.user.id,
      })
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}

const removeRegionInvitationSchema = z.object({
  invitationId: z.number(),
  regionId: z.number(),
})
type RemoveRegionInvitationSchema = z.infer<typeof removeRegionInvitationSchema>
