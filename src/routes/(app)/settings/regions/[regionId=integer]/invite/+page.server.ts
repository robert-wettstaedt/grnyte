import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
import { insertActivity } from '$lib/components/ActivityFeed/load.server'
import { createDrizzleSupabaseClient, db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { convertException } from '$lib/errors'
import { validateFormData } from '$lib/forms/validate.server'
import { notifyInvite } from '$lib/notifications/samples.server'
import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit'
import { randomUUID } from 'node:crypto'
import { addDays } from 'date-fns'
import { count, eq } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import { z } from 'zod'
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

    const [regionMembers] = await db
      .select({ count: count() })
      .from(schema.regionMembers)
      .where(eq(schema.regionMembers.regionFk, Number(params.regionId)))

    return { region, regionMembers }
  })
  // @ts-expect-error fix for missing z
}) satisfies PageServerLoad

export const actions = {
  default: async (event) => {
    const { locals, params, request, url } = event

    const authUsersResult = await db.select({ id: authUsers.id, email: authUsers.email }).from(authUsers)

    const rls = await createDrizzleSupabaseClient(locals.supabase)

    const returnValue = await rls(async (db) => {
      const region = await db.query.regions.findFirst({
        where: (table, { eq }) => eq(table.id, Number(params.regionId)),
      })

      if (
        locals.user == null ||
        region == null ||
        !checkRegionPermission(locals.userRegions, [REGION_PERMISSION_EDIT], Number(params.regionId))
      ) {
        error(404)
      }

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
        // Check if user already exists by email in auth.users
        const existingAuthUser = authUsersResult.find((u) => u.email === values.email)
        const existingUser =
          existingAuthUser == null
            ? null
            : await db.query.users.findFirst({
                where: (users, { eq }) => eq(users.authUserFk, existingAuthUser.id),
              })
        const existingMember =
          existingUser == null
            ? null
            : await db.query.regionMembers.findFirst({
                where: (members, { and, eq }) =>
                  and(
                    eq(members.regionFk, Number(params.regionId)),
                    eq(members.userFk, existingUser.id),
                    eq(members.isActive, true),
                  ),
              })

        if (existingMember != null) {
          return fail(400, {
            ...values,
            error: 'User is already a member of this region',
          })
        }

        const [regionMembers] = await db
          .select({ count: count() })
          .from(schema.regionMembers)
          .where(eq(schema.regionMembers.regionFk, Number(params.regionId)))

        if (regionMembers.count >= region.maxMembers) {
          return fail(400, {
            ...values,
            error: `This region has reached the maximum number of members (${region.maxMembers})`,
          })
        }

        // Create invitation
        const token = randomUUID()
        const expiresAt = addDays(new Date(), 7) // 7 days expiration

        const [invitation] = await db
          .insert(schema.regionInvitations)
          .values({
            email: values.email,
            expiresAt,
            invitedByFk: locals.user.id,
            regionFk: Number(params.regionId),
            status: 'pending',
            token,
          })
          .returning()

        // Send invitation email
        const inviteUrl = new URL('/invite/accept', url.origin)
        inviteUrl.searchParams.set('token', token)

        await notifyInvite(event, {
          authUserFk: existingAuthUser?.id,
          email: values.email,
          inviteUrl,
          regionName: region.name,
          username: locals.user.username,
        })

        // Create activity record
        await insertActivity(db, {
          columnName: 'invitation',
          entityId: String(locals.user.id),
          entityType: 'user',
          newValue: invitation.email,
          regionFk: Number(params.regionId),
          type: 'created',
          userFk: locals.user.id,
        })
      } catch (exception) {
        // If an error occurs during insertion, return a 400 error with the exception message
        return fail(400, { ...values, error: convertException(exception) })
      }

      // Redirect to the region settings page
      return `/settings/regions/${params.regionId}`
    })

    if (typeof returnValue === 'string') {
      redirect(303, returnValue)
    }

    return returnValue
  },
}

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})
type InviteActionValues = z.infer<typeof inviteSchema>
