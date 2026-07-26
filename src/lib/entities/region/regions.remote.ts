import { resolve } from '$app/paths'
import { regionInvitations, regionMembers, regions } from '$lib/db/schema'
import { formError, nameSchema, stringToInt } from '$lib/forms/schemas'
import { authedCommand, authedForm, authedQuery, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error, invalid } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import z from 'zod'
import { createUpdateActivity, deleteActivity, insertActivity } from '../activity/activity.server'
import { assignableRoles, type AssignableRole } from '../rolePermission/dto'
import type { RegionInvitationItem } from './dto'
import { assertMemberChangeAllowed, assertNotLastAdmin, findActiveMember, resolveRestore } from './guards.server'
import { canEditRegion } from './permissions'

const assignableRoleSchema = z.enum(assignableRoles)

/** Throws unless the caller may administer `regionFk`. */
function assertCanEdit({ userRegions }: Context, regionFk: number) {
  if (!canEditRegion(userRegions, regionFk)) {
    error(403, formError('form_noPermission'))
  }
}

const regionActionSchema = z.object({
  id: stringToInt,
  name: nameSchema,
})

export type RegionFormInput = z.input<typeof regionActionSchema>

export const updateRegion = authedForm(regionActionSchema, async ({ id, name }, { db, userRegions }) => {
  if (!canEditRegion(userRegions, id)) {
    invalid(formError('form_noPermission'))
  }

  // One statement, not a read then a write: `returning` says whether the row was there, and
  // under RLS a region the caller cannot see is the same "not found" either way.
  const [updated] = await db.update(regions).set({ name }).where(eq(regions.id, id)).returning({ id: regions.id })

  if (updated == null) {
    error(404, 'Region not found')
  }

  // No activity row: `activities.entity_type` has no 'region' member, and the feed renders
  // content changes rather than settings ones.

  return { redirectTo: resolve('/(app)/settings/regions/[regionId]', { regionId: String(id) }) }
})

/**
 * Pending invitations for a region.
 *
 * A server query rather than a Zero query on purpose: Zero syncs whole rows, and
 * `region_invitations` carries the `token` that joins a region. Selecting the display
 * columns here keeps that token off every member's device.
 */
export const listRegionInvitations = authedQuery(
  z.object({ regionFk: z.number() }),
  async ({ regionFk }, { db }): Promise<RegionInvitationItem[]> => {
    const rows = await db.query.regionInvitations.findMany({
      columns: { email: true, id: true },
      where: and(eq(regionInvitations.regionFk, regionFk), eq(regionInvitations.status, 'pending')),
      with: { invitedBy: { columns: { username: true } } },
    })

    return rows.map((row) => ({ email: row.email, id: row.id, invitedBy: row.invitedBy?.username }))
  },
)

export const updateRegionMemberRole = authedCommand(
  z.object({ regionFk: z.number(), role: assignableRoleSchema, userFk: z.number() }),
  async ({ regionFk, role, userFk }, ctx) => {
    const { db, user } = ctx
    assertCanEdit(ctx, regionFk)

    const member = await findActiveMember(db, regionFk, userFk)

    await assertMemberChangeAllowed(db, user.id, { nextRole: role, regionFk, userFk })

    await db.update(regionMembers).set({ role }).where(eq(regionMembers.id, member.id))

    await createUpdateActivity({
      db,
      entityId: String(userFk),
      entityType: 'user',
      newEntity: { role },
      oldEntity: { role: member.role },
      regionFk,
      userFk: user.id,
    })
  },
)

export interface RemovedMemberSnapshot {
  invitedByFk: null | number
  regionFk: number
  /** Not `AppRole`: undo may only put a member back on a role the app can assign in the first
   *  place, so `app_admin` cannot be smuggled in through the snapshot. */
  role: AssignableRole
  userFk: number
}

/** Remove a member from a region. Returns the snapshot {@link restoreRegionMember} undoes it with. */
export const removeRegionMember = authedCommand(
  z.object({ regionFk: z.number(), userFk: z.number() }),
  async ({ regionFk, userFk }, ctx): Promise<MutationResult<RemovedMemberSnapshot>> => {
    const { db, user } = ctx
    assertCanEdit(ctx, regionFk)

    const member = await findActiveMember(db, regionFk, userFk)

    await assertMemberChangeAllowed(db, user.id, { nextRole: null, regionFk, userFk })

    await db.delete(regionMembers).where(eq(regionMembers.id, member.id))

    await insertActivity(db, {
      columnName: 'role',
      entityId: String(userFk),
      entityType: 'user',
      regionFk,
      type: 'deleted',
      userFk: user.id,
    })

    return {
      data: {
        invitedByFk: member.invitedByFk,
        regionFk,
        // Throws only for a membership hand-set to `app_admin`, which grants no region permission
        // and which neither this screen nor any mutation can produce.
        role: assignableRoleSchema.parse(member.role),
        userFk,
      },
    }
  },
)

/** Undo a {@link removeRegionMember}, and erase the activity it logged. */
export const restoreRegionMember = authedCommand(
  z.object({
    invitedByFk: z.number().nullable(),
    regionFk: z.number(),
    role: assignableRoleSchema,
    userFk: z.number(),
  }),
  async (snapshot, ctx) => {
    const { db } = ctx
    assertCanEdit(ctx, snapshot.regionFk)

    // An undo, not an insert. See resolveRestore for what that costs to enforce.
    const { alreadyMember, authUserFk } = await resolveRestore(db, snapshot.regionFk, snapshot.userFk)

    if (!alreadyMember) {
      await db.insert(regionMembers).values({
        authUserFk,
        invitedByFk: snapshot.invitedByFk,
        isActive: true,
        regionFk: snapshot.regionFk,
        role: snapshot.role,
        userFk: snapshot.userFk,
      })
    }

    // Scoped to this region and the `role` column: a member can be removed from several regions,
    // and undoing one of those must not erase the record of the others.
    await deleteActivity(db, {
      columnName: 'role',
      entityId: String(snapshot.userFk),
      entityType: 'user',
      regionFk: snapshot.regionFk,
      type: 'deleted',
    })
  },
)

/**
 * Leave a region. Not admin-gated, any member may leave, which is what the own-row DELETE
 * policy on `region_members` exists for. A region's sole admin is refused, so a region can
 * never end up with nobody able to administer it.
 */
export const leaveRegion = authedCommand(z.object({ regionFk: z.number() }), async ({ regionFk }, { db, user }) => {
  const member = await findActiveMember(db, regionFk, user.id)

  await assertNotLastAdmin(db, regionFk, user.id)

  // The activity has to be logged BEFORE the membership goes: inserting into `activities` is
  // gated on authorize_in_region('region.edit'), which reads region_members and so is already
  // false inside this transaction once your own row is deleted. Both statements share the
  // transaction, so a failed delete still rolls the activity back.
  await insertActivity(db, {
    columnName: 'role',
    entityId: String(user.id),
    entityType: 'user',
    regionFk,
    type: 'deleted',
    userFk: user.id,
  })

  await db.delete(regionMembers).where(eq(regionMembers.id, member.id))

  return { redirectTo: resolve('/(app)/settings') }
})
