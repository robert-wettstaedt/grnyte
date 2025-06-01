import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import type { RegionActionValues } from '$lib/forms/schemas'
import { validateFormData } from '$lib/forms/validate.server'
import { notifyAcceptedInvite } from '$lib/notifications/samples.server'
import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit'
import { and, count, eq, gt } from 'drizzle-orm'
import { z } from 'zod/v4'
import type { PageServerLoad } from './$types'

export const load = (async ({ locals, url }) => {
  const token = url.searchParams.get('token')
  if (token == null) {
    error(400, 'Missing invitation token')
  }

  const rls = await createDrizzleSupabaseClient(locals.supabase)

  return await rls(async (db) => {
    const invitation = await db.query.regionInvitations.findFirst({
      where: and(
        eq(schema.regionInvitations.token, token),
        eq(schema.regionInvitations.status, 'pending'),
        gt(schema.regionInvitations.expiresAt, new Date()),
      ),
      with: {
        invitedBy: true,
        region: true,
      },
    })

    if (invitation == null) {
      error(400, 'Invalid or expired invitation')
    }

    if (locals.session?.user.email !== invitation.email) {
      error(400, 'This invitation was sent to a different email address')
    }

    return { invitation }
  })
}) satisfies PageServerLoad

export const actions = {
  accept: async (event) => {
    const { locals, request } = event

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      if (locals.user == null) {
        error(404)
      }

      // Get the form data from the request
      const data = await request.formData()
      let values: AcceptInvitationSchema

      try {
        // Validate the form data
        values = await validateFormData(acceptInvitationSchema, data)
      } catch (exception) {
        // If validation fails, return the exception as RegionActionFailure
        return exception as ActionFailure<RegionActionValues>
      }

      const invitation = await db.query.regionInvitations.findFirst({
        where: (invitations, { and, eq, gt }) =>
          and(
            eq(invitations.token, values.token),
            eq(invitations.status, 'pending'),
            gt(invitations.expiresAt, new Date()),
          ),
        with: {
          invitedBy: true,
          region: true,
        },
      })

      if (invitation == null) {
        return fail(400, { ...values, message: 'Invalid or expired invitation' })
      }

      if (locals.session?.user.email !== invitation.email) {
        return fail(400, { ...values, message: 'This invitation was sent to a different email address' })
      }

      const region = await db.query.regions.findFirst({
        columns: {
          maxMembers: true,
        },
        where: eq(schema.regions.id, invitation.regionFk),
      })

      if (region == null) {
        return fail(404, { ...values, message: 'Region not found' })
      }

      const [regionMembers] = await db
        .select({ count: count() })
        .from(schema.regionMembers)
        .where(eq(schema.regionMembers.regionFk, invitation.regionFk))

      if (regionMembers.count >= region.maxMembers) {
        return fail(400, {
          ...values,
          message: `This region has reached the maximum number of members (${region.maxMembers})`,
        })
      }

      // Add user to region
      await db.insert(schema.regionMembers).values({
        authUserFk: locals.user.authUserFk,
        invitedBy: invitation.invitedBy.id,
        isActive: true,
        regionFk: invitation.regionFk,
        role: 'region_user',
        userFk: locals.user.id,
      })

      // Update invitation status
      await db
        .update(schema.regionInvitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
          acceptedBy: locals.user.id,
        })
        .where(eq(schema.regionInvitations.token, values.token))

      await notifyAcceptedInvite(event, {
        authUserFk: invitation.invitedBy.authUserFk,
        regionName: invitation.region.name,
        username: locals.user.username,
      })

      // Create activity record
      await insertActivity(db, {
        columnName: 'invitation',
        entityId: String(locals.user.id),
        entityType: 'user',
        regionFk: invitation.regionFk,
        type: 'updated',
        userFk: locals.user.id,
      })

      return '/'
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}

const acceptInvitationSchema = z.object({
  token: z.string(),
})
type AcceptInvitationSchema = z.infer<typeof acceptInvitationSchema>
