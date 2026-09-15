import { resolve } from '$app/paths'
import { getRequestEvent, query } from '$app/server'
import { regionInvitations, regionMembers, regions } from '$lib/db/schema'
import { formError, nameSchema, stringToInt } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { getLocale } from '$lib/paraglide/runtime'
import { authedCommand, authedForm, authedQuery, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error, invalid } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import { createUpdateEvent, deleteEvent, insertEvent } from '../event/event.server'
import { notify, notifyOutOfBand, retractOutOfBand } from '../notification/notification.server'
import { assignableRoles, type AssignableRole } from '../rolePermission/dto'
import { createRegionForUser, listOwnedRegions } from './create.server'
import { MAX_OWNED_REGIONS, type RegionInvitationItem, type UserInvitationItem } from './dto'
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
import { canEditRegion, canReadRegion } from './permissions'
import { mapLayerSchema, mapLayersFingerprint } from './settings'
import { currentValue, lockRegionSettings, writableKey, writeRegionSettings, type WritableKey } from './settings.server'
import { addTag, removeTag, renameTag, tagUsage } from './tags.server'
import { MAX_TAGS, tagNameSchema } from './tagVocabulary'

const assignableRoleSchema = z.enum(assignableRoles)

/** Throws unless the caller may administer `regionFk`. */
function assertCanEdit({ userRegions }: Context, regionFk: number) {
  if (!canEditRegion(userRegions, regionFk)) {
    error(403, formError('form_noPermission'))
  }
}

/** Throws unless the caller is a reading member of `regionFk`. For the reads every member is
 *  entitled to, as opposed to the administrative ones {@link assertCanEdit} guards. */
function assertIsMember({ userRegions }: Context, regionFk: number) {
  if (!canReadRegion(userRegions, regionFk)) {
    error(403, formError('form_noPermission'))
  }
}

/** Throws unless a settings write actually landed. Silence was the old behaviour and the worst
 *  one: the junction rows had already moved, so a retired tag vanished while the screen showed it. */
function assertWritten(outcome: 'ok' | 'zero') {
  if (outcome === 'zero') {
    error(404, formError('region_notFound'))
  }
}

const regionCreateSchema = z.object({ name: nameSchema })

/** Found a region, with its creator as `region_admin`. The one write here open to a caller who
 *  administers nothing yet. */
export const createRegion = authedForm(
  regionCreateSchema,
  async ({ name }, { user }): Promise<MutationResult<{ regionId: number }>> => {
    // The friendly version of the cap. `createRegionForUser` re-checks it and enforces it.
    if ((await listOwnedRegions(user.id)).length >= MAX_OWNED_REGIONS) {
      invalid(formError('region_capReached', { count: MAX_OWNED_REGIONS }))
    }

    const region = await createRegionForUser({ authUserId: user.authUserFk, name, userId: user.id })

    // No `redirectTo`: the Zero client is session scoped, so the new membership would sync
    // nowhere. The page reloads the document instead, like accepting an invitation does.
    return { data: { regionId: region.id } }
  },
)

const regionActionSchema = z.object({
  id: stringToInt,
  name: nameSchema,
})

export const updateRegion = authedForm(regionActionSchema, async ({ id, name }, { db, userRegions }) => {
  if (!canEditRegion(userRegions, id)) {
    invalid(formError('form_noPermission'))
  }

  // One statement: `returning` says whether the row was there, and under RLS an invisible
  // region is the same "not found" either way.
  const [updated] = await db.update(regions).set({ name }).where(eq(regions.id, id)).returning({ id: regions.id })

  if (updated == null) {
    error(404, formError('region_notFound'))
  }

  // No event row: object columns have no 'region' member, and the feed renders content changes.

  return { redirectTo: resolve('/(app)/settings/regions/[regionId]', { regionId: String(id) }) }
})

const regionMapLayersSchema = z.object({
  id: stringToInt,
  /** Fingerprint of the layers the form was seeded with, so a save proves what it replaces.
   *  Defaulted, so a tab loaded before this deployed lands on the stale refusal rather than
   *  an unrenderable invalid_type issue. */
  known: z._default(z.optional(z.string()), ''),
  mapLayers: z._default(z.optional(z.array(mapLayerSchema)), []),
})

/**
 * Replace a region's WMS map overlays. Removing them all is legitimate, so an empty submission is
 * indistinguishable from a form that rendered before its data arrived: the payload has to prove
 * which layers it replaces. A fingerprint and not a count, because a delete plus an add leaves
 * three as three.
 */
export const updateRegionMapLayers = authedForm(regionMapLayersSchema, async ({ id, known, mapLayers }, ctx) => {
  const { db } = ctx

  // Membership first, so a non-admin is told so: the lock cannot say, since Postgres applies the
  // update policy to `for update` and a non-admin simply sees no row.
  if (!canEditRegion(ctx.userRegions, id)) {
    invalid(formError('form_noPermission'))
  }

  // Locked, not merely read. Also what makes a missing row safe: an absent blob reads as complete
  // and empty, so a matching `known` once answered a write against nothing with a success.
  const locked = await lockRegionSettings(db, id)
  if (locked == null) {
    invalid(formError('region_notFound'))
  }

  // Two refusals, two answers: an unreadable blob is not "someone else changed this", and that
  // message would send the admin round a loop reopening cannot leave.
  const writable = writableKey(locked, 'mapLayers')
  if (writable == null) {
    invalid(formError('region_mapLayersUnreadableBody'))
  }

  // The lock stops a concurrent writer; this stops a stale HUMAN, whose form rendered before
  // somebody else's save. Holding the row says nothing about what was on their screen.
  if (mapLayersFingerprint(currentValue(writable)) !== known) {
    invalid(formError('region_mapLayersStale'))
  }

  if ((await writeRegionSettings(db, writable, mapLayers)) === 'zero') {
    // The row went away, or an admin was demoted mid-request. Both read as gone here; the next
    // request re-reads `userRegions` and refuses with `form_noPermission`.
    invalid(formError('region_notFound'))
  }

  return { redirectTo: resolve('/(app)/settings/regions/[regionId]', { regionId: String(id) }) }
})

/** How many routes carry each of a region's tags: one grouped read, not one per tag. Until it
 *  lands the remove control stays disabled rather than destroying an unknown quantity. */
export const regionTagUsage = authedQuery(
  z.object({ regionFk: z.number() }),
  ({ regionFk }, ctx): Promise<Record<string, number>> => {
    // Admin, not member: RLS only ever scoped this to members, so any region_user could pull tag
    // counts for a region they cannot administer. Not via `lockEditableTags`: no lock wanted here.
    assertCanEdit(ctx, regionFk)

    return tagUsage(ctx.db, regionFk)
  },
)

/**
 * Lock the region's row and return permission to rewrite its vocabulary, which comes back on the
 * proof rather than from `ctx.userRegions`: the hook parses that on another connection, so two
 * admins adding a tag at once each wrote a stale copy back and the second erased the first's word.
 *
 * Membership is checked before the lock, which cannot tell "gone" from "not allowed".
 */
async function lockEditableTags(ctx: Context, regionFk: number): Promise<WritableKey<'tags'>> {
  assertCanEdit(ctx, regionFk)

  const locked = await lockRegionSettings(ctx.db, regionFk)
  if (locked == null) {
    error(404, formError('region_notFound'))
  }

  // Refused before any junction row moves. A blob this build cannot read whole would have its
  // real tags permanently replaced by whatever was readable.
  const writable = writableKey(locked, 'tags')
  if (writable == null) {
    error(409, formError('region_tagsUnreadable'))
  }

  return writable
}

/** Add a word to a region's route-tag vocabulary. Tagged on nothing until somebody applies it. */
export const addRegionTag = authedCommand(
  z.object({ name: tagNameSchema, regionFk: z.number() }),
  async ({ name, regionFk }, ctx) => {
    const writable = await lockEditableTags(ctx, regionFk)
    const stored = currentValue(writable)

    // Nothing else catches this: a jsonb array has no unique constraint.
    if (stored.includes(name)) {
      error(409, formError('region_tagDuplicate'))
    }

    if (stored.length >= MAX_TAGS) {
      error(409, formError('region_tagsTooMany', { count: MAX_TAGS }))
    }

    assertWritten(await addTag(ctx.db, writable, name))
  },
)

/** Rename a tag, carrying it onto every route already tagged with it. See {@link renameTag}. */
export const renameRegionTag = authedCommand(
  z.object({ from: z.string(), regionFk: z.number(), to: tagNameSchema }),
  async ({ from, regionFk, to }, ctx) => {
    const writable = await lockEditableTags(ctx, regionFk)
    const stored = currentValue(writable)

    if (!stored.includes(from)) {
      error(404, formError('region_tagGone'))
    }

    if (from === to) {
      return
    }

    if (stored.includes(to)) {
      error(409, formError('region_tagDuplicate'))
    }

    assertWritten(await renameTag(ctx.db, writable, from, to))
  },
)

/** Retire a tag, deleting it from every route that carries it. See {@link removeTag}. */
export const removeRegionTag = authedCommand(
  z.object({ name: z.string(), regionFk: z.number() }),
  async ({ name, regionFk }, ctx) => {
    const writable = await lockEditableTags(ctx, regionFk)
    const stored = currentValue(writable)

    // The delete underneath is unconditional, so a name this region does not have would take
    // real junction rows with it.
    if (!stored.includes(name)) {
      error(404, formError('region_tagGone'))
    }

    assertWritten(await removeTag(ctx.db, writable, name))
  },
)

/** Pending invitations for a region. A server query, not Zero: Zero syncs whole rows and
 *  `region_invitations` carries the `token` that joins a region. */
export const listRegionInvitations = authedQuery(
  z.object({ regionFk: z.number() }),
  async ({ regionFk }, ctx): Promise<RegionInvitationItem[]> => {
    // MEMBERSHIP, not admin: a pending invitation holds a seat, so every member runs this for the
    // seat counter. Admin here 403s on every ordinary member's page load.
    assertIsMember(ctx, regionFk)

    const rows = await ctx.db.query.regionInvitations.findMany({
      columns: { email: true, id: true, lastSentAt: true },
      // The same predicate the accept path uses, so a timed-out invitation stops holding a seat.
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

/** The request-scoped half of a mail send, so `invite.server.ts` never reaches for
 *  `getRequestEvent()` itself and stays importable from a test. */
const mailContext = (): MailContext => ({ ambientLocale: getLocale(), origin: getRequestEvent().url.origin })

/** Invite an address to a region and mail them the link. Returns whether the mail went out. */
export const inviteRegionMember = authedForm(
  z.object({ email: z.email({ error: formError('auth_emailInvalid') }), regionFk: stringToInt }),
  async ({ email, regionFk }, ctx): Promise<MutationResult<{ email: string; sent: boolean }>> => {
    const { db, user } = ctx
    assertCanEdit(ctx, regionFk)

    const region = await db.query.regions.findFirst({ columns: { name: true }, where: eq(regions.id, regionFk) })
    if (region == null) {
      error(404, formError('region_notFound'))
    }

    const address = normalizeEmail(email)
    const invitation = await createInvitation(db, { email: address, invitedByFk: user.id, regionFk })

    const sent = await sendInvitationEmail(
      db,
      {
        actorFk: user.id,
        email: address,
        id: invitation.id,
        idempotencyKey: `invitation-${invitation.id}`,
        inviter: user.username,
        regionFk,
        regionName: region.name,
        token: invitation.token,
      },
      mailContext(),
    )

    // After the send, and only when it went out: logging ahead of it put "You invited ..." in the
    // log for a mail nobody received. `resendInvitation` checks the log so a resend never
    // re-announces.
    if (sent) {
      // `subject_fk` holds the INVITER: the invitee has no account to point at. The address is
      // in `metadata`, which is what the card renders and what keeps two invitations apart.
      await insertEvent(db, {
        actorFk: user.id,
        metadata: address,
        object: { id: user.id, type: 'user' },
        regionFk,
        verb: 'invite',
      })
    }

    return { data: { email: address, sent } }
  },
)

/** Re-send an existing invitation with a refreshed expiry. Throttled to one send per minute. */
export const resendRegionInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db, user, userRegions }): Promise<MutationResult<{ email: string; sent: boolean }>> => ({
    data: await resendInvitation(
      db,
      { invitationFk, inviter: user.username, inviterFk: user.id, userRegions },
      mailContext(),
    ),
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

    // `subject_fk` holds the ACTOR and the address is in `metadata`. That pair is what tells this
    // apart from `removeRegionMember`, which writes the same verb: never read the verb alone.
    await insertEvent(db, {
      actorFk: user.id,
      metadata: email,
      object: { id: user.id, type: 'user' },
      regionFk,
      verb: 'remove',
    })

    return { data: { invitationFk } }
  },
)

/** Undo a {@link revokeRegionInvitation}: back to pending with a fresh expiry, same token, and
 *  erase the event the revoke logged. */
export const restoreRegionInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db, userRegions }) => {
    const { email, regionFk } = await restoreInvitation(db, invitationFk, userRegions)

    // Keyed on the address, not on who revoked it: any admin may undo any admin's revoke, and
    // pinning the caller would leave a "revoked" card beside a live invitation.
    await deleteEvent(db, { metadata: email, regionFk, verb: 'remove' })
  },
)

/** Accept an invitation. The address comes from the verified token, not `ctx.user`, which is the
 *  `public.users` row and carries none. */
export const acceptRegionInvitation = authedCommand(
  z.object({ token: z.uuid() }),
  async ({ token }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const claims = getRequestEvent().locals.claims

    if (claims?.email == null) {
      error(401, formError('auth_notSignedIn'))
    }

    return { data: await acceptInvitation({ authUserId: claims.sub, email: claims.email, token }) }
  },
)

/** Live invitations addressed to the signed-in user. A plain `query`: it reads over the base `db`,
 *  and a signed-out caller gets an empty list rather than a 401. */
export const listMyInvitations = query(async (): Promise<UserInvitationItem[]> => {
  const email = getRequestEvent().locals.claims?.email
  return email == null ? [] : listInvitationsForEmail(email)
})

/** Accept an invitation from the in-app list, which knows the row id but never the token. RLS
 *  scopes the lookup to the caller, and `acceptInvitation` re-checks the address. */
export const acceptMyInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const claims = getRequestEvent().locals.claims

    if (claims?.email == null) {
      error(401, formError('auth_notSignedIn'))
    }

    const invitation = await db.query.regionInvitations.findFirst({
      columns: { token: true },
      where: and(eq(regionInvitations.id, invitationFk), livePredicate()),
    })

    if (invitation == null) {
      error(404, formError('invite_notFound'))
    }

    return {
      data: await acceptInvitation({ authUserId: claims.sub, email: claims.email, token: invitation.token }),
    }
  },
)

export const updateRegionMemberRole = authedCommand(
  z.object({ regionFk: z.number(), role: assignableRoleSchema, userFk: z.number() }),
  async ({ regionFk, role, userFk }, ctx) => {
    const { afterCommit, db, user } = ctx
    assertCanEdit(ctx, regionFk)

    const member = await findActiveMember(db, regionFk, userFk)

    await assertMemberChangeAllowed(db, user.id, { nextRole: role, regionFk, userFk })

    await db.update(regionMembers).set({ role }).where(eq(regionMembers.id, member.id))

    // The one case where subject and actor genuinely differ: somebody acts on somebody else.
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { role },
      object: { id: userFk, type: 'user' },
      oldEntity: { role: member.role },
      regionFk,
    })

    // `metadata` carries the role because a person holds a different one per region.
    // Deferred so the recipient check reads the committed membership, not this transaction's view.
    afterCommit(() =>
      notify({
        actorFk: user.id,
        metadata: role,
        object: { id: userFk, type: 'user' },
        regionFk,
        sourceType: 'role_changed',
        userFks: [userFk],
      }),
    )
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
    const { afterCommit, db, user } = ctx
    assertCanEdit(ctx, regionFk)

    const member = await findActiveMember(db, regionFk, userFk)

    await assertMemberChangeAllowed(db, user.id, { nextRole: null, regionFk, userFk })

    await db.delete(regionMembers).where(eq(regionMembers.id, member.id))

    await insertEvent(db, {
      actorFk: user.id,
      object: { id: userFk, type: 'user' },
      regionFk,
      verb: 'remove',
    })

    // Queued, not sent: Undo deletes the row inside `DIRECTED_DEBOUNCE_MS`, which is why that
    // snackbar has a bounded duration. `notifyOutOfBand`, since the recipient is no longer a member.
    afterCommit(() => notifyOutOfBand({ actorFk: user.id, regionFk, sourceType: 'membership_removed', userFk }))

    return {
      data: {
        invitedByFk: member.invitedByFk,
        regionFk,
        // Throws only for a membership hand-set to `app_admin`, which nothing here can produce.
        role: assignableRoleSchema.parse(member.role),
        userFk,
      },
    }
  },
)

/** Undo a {@link removeRegionMember}, and erase the event it logged. */
export const restoreRegionMember = authedCommand(
  z.object({
    invitedByFk: z.nullable(z.number()),
    regionFk: z.number(),
    role: assignableRoleSchema,
    userFk: z.number(),
  }),
  async (snapshot, ctx) => {
    const { afterCommit, db } = ctx
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

    // Scoped to this region but not to the caller: any admin may undo any admin's removal.
    // `metadata: null` is what keeps it off a revoked invitation, which writes the same verb.
    await deleteEvent(db, {
      metadata: null,
      object: { id: snapshot.userFk, type: 'user' },
      regionFk: snapshot.regionFk,
      verb: 'remove',
    })

    // And take back the notice the removal queued: the reason the queue is a row, not a send.
    //
    // Deferred like the write it undoes: `retractOutOfBand` runs on the privileged handle, so it
    // takes a second connection while this handler holds the RLS transaction's own and commits
    // independently. Inline, a restore that failed after this point would leave the member removed
    // with the notice already erased.
    afterCommit(() =>
      retractOutOfBand({
        regionFk: snapshot.regionFk,
        sourceType: 'membership_removed',
        userFk: snapshot.userFk,
      }),
    )
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

  // Logged BEFORE the membership goes: inserting into `events` is gated on
  // authorize_in_region, which reads region_members and so is already false inside this
  // transaction once your own row is deleted. Both statements share the transaction, so a failed
  // delete still rolls the event back.
  //
  // `leave`, not `remove`: being removed and choosing to leave are two different things, and
  // sharing one spelling made the feed render a member who left as "Mara removed Mara".
  await insertEvent(db, {
    actorFk: user.id,
    object: { id: user.id, type: 'user' },
    regionFk,
    verb: 'leave',
  })

  await db.delete(regionMembers).where(eq(regionMembers.id, member.id))

  return { redirectTo: resolve('/(app)/settings') }
})
