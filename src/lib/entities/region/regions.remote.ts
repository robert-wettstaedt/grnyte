import { resolve } from '$app/paths'
import { getRequestEvent, query } from '$app/server'
import { regionInvitations, regionMembers, regions } from '$lib/db/schema'
import { formError, nameSchema, stringToInt } from '$lib/forms/schemas'
import { getLocale } from '$lib/paraglide/runtime'
import { authedCommand, authedForm, authedQuery, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error, invalid } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import z from 'zod'
import { createUpdateActivity, deleteActivity, insertActivity } from '../activity/activity.server'
import { assignableRoles, type AssignableRole } from '../rolePermission/dto'
import type { RegionInvitationItem, UserInvitationItem } from './dto'
import { assertMemberChangeAllowed, assertNotLastAdmin, findActiveMember, resolveRestore } from './guards.server'
import {
  acceptInvitation,
  createInvitation,
  listInvitationsForEmail,
  livePredicate,
  normalizeEmail,
  resendInvitation,
  restoreInvitation,
  revokeInvitation,
  sendInvitationEmail,
  type MailContext,
} from './invite.server'
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
      columns: { email: true, id: true, lastSentAt: true },
      // The same predicate the accept path uses, so a timed-out invitation stops holding a seat
      // here as well as there.
      where: and(eq(regionInvitations.regionFk, regionFk), livePredicate()),
      with: { invitedBy: { columns: { username: true } } },
    })

    return rows.map((row) => ({
      email: row.email,
      id: row.id,
      invitedBy: row.invitedBy?.username,
      lastSentAt: row.lastSentAt ?? undefined,
    }))
  },
)

/**
 * The request-scoped half of a mail send. This is the adapter: `invite.server.ts` takes these as
 * arguments precisely so it never has to reach for `getRequestEvent()` or `getLocale()` itself,
 * which is what keeps it importable from a test.
 */
const mailContext = (): MailContext => ({ ambientLocale: getLocale(), origin: getRequestEvent().url.origin })

/** Invite an address to a region and mail them the link. Returns whether the mail went out. */
export const inviteRegionMember = authedForm(
  z.object({ email: z.email({ error: formError('auth_emailInvalid') }), regionFk: stringToInt }),
  async ({ email, regionFk }, ctx): Promise<MutationResult<{ email: string; sent: boolean }>> => {
    const { db, user } = ctx
    assertCanEdit(ctx, regionFk)

    const region = await db.query.regions.findFirst({ columns: { name: true }, where: eq(regions.id, regionFk) })
    if (region == null) {
      error(404, 'Region not found')
    }

    const address = normalizeEmail(email)
    const invitation = await createInvitation(db, { email: address, invitedByFk: user.id, regionFk })

    // The invitee has no user row yet, so the activity is logged against the inviter, with the
    // address as the value. Same shape the revoke below erases.
    await insertActivity(db, {
      columnName: 'invitation',
      entityId: String(user.id),
      entityType: 'user',
      newValue: address,
      regionFk,
      type: 'created',
      userFk: user.id,
    })

    const sent = await sendInvitationEmail(
      db,
      {
        email: address,
        id: invitation.id,
        idempotencyKey: `invitation-${invitation.id}`,
        inviter: user.username,
        regionName: region.name,
        token: invitation.token,
      },
      mailContext(),
    )

    return { data: { email: address, sent } }
  },
)

/** Re-send an existing invitation with a refreshed expiry. Throttled to one send per minute. */
export const resendRegionInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db, user, userRegions }): Promise<MutationResult<{ email: string; sent: boolean }>> => ({
    data: await resendInvitation(db, { invitationFk, inviter: user.username, userRegions }, mailContext()),
  }),
)

export interface RevokedInvitationSnapshot {
  invitationFk: number
}

/** Withdraw an invitation. See {@link revokeInvitation} for why it is an update, not a delete. */
export const revokeRegionInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db, user, userRegions }): Promise<MutationResult<RevokedInvitationSnapshot>> => {
    const { email, regionFk } = await revokeInvitation(db, invitationFk, userRegions)

    await insertActivity(db, {
      columnName: 'invitation',
      entityId: String(user.id),
      entityType: 'user',
      newValue: email,
      regionFk,
      type: 'deleted',
      userFk: user.id,
    })

    return { data: { invitationFk } }
  },
)

/** Undo a {@link revokeRegionInvitation}: back to pending with a fresh expiry, same token, and
 *  erase the activity the revoke logged. */
export const restoreRegionInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db, userRegions }) => {
    const { email, regionFk } = await restoreInvitation(db, invitationFk, userRegions)

    // Keyed on the address rather than on who revoked it: any admin's undo erases the record,
    // the same way restoreRegionMember's does.
    await deleteActivity(db, {
      columnName: 'invitation',
      entityType: 'user',
      newValue: email,
      regionFk,
      type: 'deleted',
    })
  },
)

/**
 * Accept an invitation as the signed-in user.
 *
 * The address comes from the session rather than `ctx.user`, which is the `public.users` row and
 * carries none. The write itself runs off the RLS transaction, see `acceptInvitation`.
 */
export const acceptRegionInvitation = authedCommand(
  z.object({ token: z.uuid() }),
  async ({ token }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const session = getRequestEvent().locals.session

    if (session?.user.email == null) {
      error(401, 'Not authenticated')
    }

    return { data: await acceptInvitation({ authUserId: session.user.id, email: session.user.email, token }) }
  },
)

/**
 * Live invitations addressed to the signed-in user, for their settings screen.
 *
 * A plain `query` rather than `authedQuery`: it reads over the base `db` (see
 * `listInvitationsForEmail`), so there is no RLS transaction to open, and a signed-out caller is
 * an empty list rather than a 401 - the settings screen is behind the auth guard anyway.
 */
export const listMyInvitations = query(async (): Promise<UserInvitationItem[]> => {
  const email = getRequestEvent().locals.session?.user.email
  return email == null ? [] : listInvitationsForEmail(email)
})

/**
 * Accept an invitation from the in-app list, which knows the row id but never the token.
 *
 * The lookup runs on the caller's RLS transaction, where `users can read own region_invitations`
 * scopes it to rows addressed to them; `acceptInvitation` then re-checks the address against the
 * session, so a guessed id gets nowhere either way.
 */
export const acceptMyInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const session = getRequestEvent().locals.session

    if (session?.user.email == null) {
      error(401, 'Not authenticated')
    }

    const invitation = await db.query.regionInvitations.findFirst({
      columns: { token: true },
      where: and(eq(regionInvitations.id, invitationFk), livePredicate()),
    })

    if (invitation == null) {
      error(404, formError('invite_notFound'))
    }

    return {
      data: await acceptInvitation({ authUserId: session.user.id, email: session.user.email, token: invitation.token }),
    }
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
