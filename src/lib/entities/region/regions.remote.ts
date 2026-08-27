import { resolve } from '$app/paths'
import { getRequestEvent, query } from '$app/server'
import { regionInvitations, regionMembers, regions } from '$lib/db/schema'
import { formError, nameSchema, stringToInt } from '$lib/forms/schemas'
import { getLocale } from '$lib/paraglide/runtime'
import { authedCommand, authedForm, authedQuery, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, sql } from 'drizzle-orm'
import z from 'zod'
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
import { mapLayerSchema, type RegionSettings } from './settings'
import { addTag, removeTag, renameTag, tagUsage } from './tags.server'
import { MAX_TAGS, regionTags, tagNameSchema } from './tagVocabulary'

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

const regionCreateSchema = z.object({ name: nameSchema })

/**
 * Found a region, with its creator as `region_admin`.
 *
 * The one write in this file open to a caller who administers nothing yet: it is what the
 * zero-region onboarding screen submits, and the same form serves the settings entry point for
 * somebody starting a second one.
 */
export const createRegion = authedForm(
  regionCreateSchema,
  async ({ name }, { user }): Promise<MutationResult<{ regionId: number }>> => {
    // The friendly, bannered version of the cap. `createRegionForUser` re-checks it inside its own
    // transaction, and that check is the one that actually enforces it.
    if ((await listOwnedRegions(user.id)).length >= MAX_OWNED_REGIONS) {
      invalid(formError('region_capReached', { count: MAX_OWNED_REGIONS }))
    }

    const region = await createRegionForUser({ authUserId: user.authUserFk, name, userId: user.id })

    // Deliberately no `redirectTo`: that navigates client-side, and the Zero client is session
    // scoped with `userRegions` preloaded at init, so the new membership would sync nowhere and
    // the destination would render as if the region did not exist. The page reloads the document
    // instead, the same way accepting an invitation does.
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

  // One statement, not a read then a write: `returning` says whether the row was there, and
  // under RLS a region the caller cannot see is the same "not found" either way.
  const [updated] = await db.update(regions).set({ name }).where(eq(regions.id, id)).returning({ id: regions.id })

  if (updated == null) {
    error(404, 'Region not found')
  }

  // No event row: an event's object columns have no 'region' member, and the feed renders
  // content changes rather than settings ones.

  return { redirectTo: resolve('/(app)/settings/regions/[regionId]', { regionId: String(id) }) }
})

/**
 * Write one key of a region's `settings`. Merged rather than assigned: `settings` is one jsonb blob
 * and each settings screen owns a single key of it, so a key added to `RegionSettings` later cannot
 * be wiped by saving an older screen.
 */
const mergeSettings = (db: Context['db'], id: number, patch: Partial<RegionSettings>) =>
  db
    .update(regions)
    .set({ settings: sql`coalesce(${regions.settings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(regions.id, id))

const regionMapLayersSchema = z.object({
  id: stringToInt,
  mapLayers: z.array(mapLayerSchema).optional().default([]),
})

/** Replace a region's WMS map overlays. An empty list is a valid submission: it removes them all. */
export const updateRegionMapLayers = authedForm(regionMapLayersSchema, async ({ id, mapLayers }, ctx) => {
  const { db } = ctx

  if (!canEditRegion(ctx.userRegions, id)) {
    invalid(formError('form_noPermission'))
  }

  await mergeSettings(db, id, { mapLayers })

  return { redirectTo: resolve('/(app)/settings/regions/[regionId]', { regionId: String(id) }) }
})

/**
 * How many routes carry each of a region's tags, for the settings screen: one grouped read for the
 * whole list rather than one per tag. Until it lands, that screen's remove control stays disabled
 * rather than offering to destroy an unknown quantity.
 */
export const regionTagUsage = authedQuery(
  z.object({ regionFk: z.number() }),
  ({ regionFk }, ctx): Promise<Record<string, number>> => {
    // The three tag mutations below reach this check through `editableTags`; the read sitting next
    // to them did not, and took the client's `regionFk` as given. All RLS ever gave it was a MEMBER
    // scope, so any region_user could pull a region they cannot administer and how many routes
    // carry each of its tags, and a stranger got a silent empty object instead of a refusal.
    // Not routed through `editableTags`: that exists to hand a mutation the STORED vocabulary, and
    // this query wants the gate, not the list. Admin rather than edit, because the screen it feeds
    // (settings/regions/[regionId]/tags) is admin-only, the same as every other write in this file.
    assertCanEdit(ctx, regionFk)

    return tagUsage(ctx.db, regionFk)
  },
)

/**
 * The region's vocabulary as it stands right now, having checked the caller may rewrite it.
 *
 * Read per request from `ctx.userRegions`, never from anything the client submitted. That is what
 * keeps the three mutations below additive: each one touches the tag it was handed by name and
 * leaves the rest of the list alone, so a tag another admin adds while this screen is open cannot
 * be deleted by a stale snapshot.
 */
function editableTags(ctx: Context, regionFk: number): string[] {
  assertCanEdit(ctx, regionFk)
  return regionTags(ctx.userRegions, regionFk)
}

/** Add a word to a region's route-tag vocabulary. Tagged on nothing until somebody applies it. */
export const addRegionTag = authedCommand(
  z.object({ name: tagNameSchema, regionFk: z.number() }),
  async ({ name, regionFk }, ctx) => {
    const stored = editableTags(ctx, regionFk)

    // Nothing else catches this: the vocabulary is a jsonb array, so there is no unique constraint,
    // and a duplicated name would render as two identical chips forever.
    if (stored.includes(name)) {
      error(409, formError('region_tagDuplicate'))
    }

    if (stored.length >= MAX_TAGS) {
      error(409, formError('region_tagsTooMany', { count: MAX_TAGS }))
    }

    await addTag(ctx.db, regionFk, stored, name)
  },
)

/** Rename a tag, carrying it onto every route already tagged with it. See {@link renameTag}. */
export const renameRegionTag = authedCommand(
  z.object({ from: z.string(), regionFk: z.number(), to: tagNameSchema }),
  async ({ from, regionFk, to }, ctx) => {
    const stored = editableTags(ctx, regionFk)

    if (!stored.includes(from)) {
      error(404, formError('region_tagGone'))
    }

    if (from === to) {
      return
    }

    if (stored.includes(to)) {
      error(409, formError('region_tagDuplicate'))
    }

    await renameTag(ctx.db, regionFk, stored, from, to)
  },
)

/** Retire a tag, deleting it from every route that carries it. See {@link removeTag}. */
export const removeRegionTag = authedCommand(
  z.object({ name: z.string(), regionFk: z.number() }),
  async ({ name, regionFk }, ctx) => {
    await removeTag(ctx.db, regionFk, editableTags(ctx, regionFk), name)
  },
)

/**
 * Pending invitations for a region.
 *
 * A server query rather than a Zero query on purpose: Zero syncs whole rows, and
 * `region_invitations` carries the `token` that joins a region. Selecting the display
 * columns here keeps that token off every member's device.
 */
export const listRegionInvitations = authedQuery(
  z.object({ regionFk: z.number() }),
  async ({ regionFk }, ctx): Promise<RegionInvitationItem[]> => {
    // MEMBERSHIP, not admin. The screen renders the list only to admins, but it runs this query for
    // every member on purpose: a pending invitation holds a seat, so a member who could not see them
    // would be shown a lower seat count than the admin sitting next to them
    // (settings/regions/[regionId]/+page.svelte). Requiring admin here breaks that counter and 403s
    // on every ordinary member's page load.
    //
    // So this reproduces exactly what the `region members can read region_invitations` policy gave
    // it, which is what the handler has to own once RLS keeps region scoping only. The one thing it
    // adds is refusing a non-member, who previously got a silent empty list.
    assertIsMember(ctx, regionFk)

    const rows = await ctx.db.query.regionInvitations.findMany({
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

    // After the send, and only when it went out. The invitee has no user row yet, so the row is
    // logged against the inviter with the address as its value, the shape the revoke erases.
    //
    // `sendInvitationEmail` reports failure rather than throwing, and logging ahead of it put
    // "You invited lea@example.com" in the region's log for a mail nobody received. The
    // invitation itself survives a failed send, so a successful Resend logs it then, and
    // `resendInvitation` checks the log first so a resend never re-announces an invitation.
    if (sent) {
      // `subject_fk` holds the INVITER here, degenerately: an invitation names an address and
      // the invitee has no account to point at. The address is in `metadata`, which is what the
      // card renders from and what keeps two invitations from folding into one.
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

    // The invitation's own shape, in reverse: `subject_fk` holds the ACTOR, because the invitee
    // still has no account to point at, and the address is in `metadata`. That pair is what tells
    // this apart from `removeRegionMember`, which writes the same verb with the removed person as
    // its subject and no metadata at all, so read the two together and never the verb alone.
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

    // Keyed on the address rather than on who revoked it: any admin's undo erases the record,
    // the same way restoreRegionMember's does. The command takes only an id, so an admin can
    // restore an invitation somebody else revoked, and pinning the caller would leave that admin's
    // "revoked" card standing next to a live pending invitation. The address is also what keeps
    // this off a member removal, whose `remove` event carries no metadata.
    await deleteEvent(db, { metadata: email, regionFk, verb: 'remove' })
  },
)

/**
 * Accept an invitation as the signed-in user.
 *
 * The address comes from the verified token rather than `ctx.user`, which is the `public.users` row
 * and carries none. The write itself runs off the RLS transaction, see `acceptInvitation`.
 */
export const acceptRegionInvitation = authedCommand(
  z.object({ token: z.uuid() }),
  async ({ token }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const claims = getRequestEvent().locals.claims

    if (claims?.email == null) {
      error(401, 'Not authenticated')
    }

    return { data: await acceptInvitation({ authUserId: claims.sub, email: claims.email, token }) }
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
  const email = getRequestEvent().locals.claims?.email
  return email == null ? [] : listInvitationsForEmail(email)
})

/**
 * Accept an invitation from the in-app list, which knows the row id but never the token.
 *
 * The lookup runs on the caller's RLS transaction, where `users can read own region_invitations`
 * scopes it to rows addressed to them; `acceptInvitation` then re-checks the address against the
 * verified token, so a guessed id gets nowhere either way.
 */
export const acceptMyInvitation = authedCommand(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }, { db }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const claims = getRequestEvent().locals.claims

    if (claims?.email == null) {
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

    // What you can do in a region just changed, and the feed card says it in the third person to
    // everybody. `metadata` carries the role because the sentence needs to name it and the user
    // row the notification points at cannot: a person holds a different role per region.
    //
    // Deferred so the recipient check reads the committed membership rather than this
    // transaction's private view. It does not matter while every assignable role holds
    // `region.read`, and it is exactly what would silently drop the notification the day one
    // does not.
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

    // Queued, not sent: the row waits out `DIRECTED_DEBOUNCE_MS`, and the Undo this returns a
    // snapshot for deletes it inside that window - which is why that snackbar is the one place in
    // the app with a bounded duration. `notifyOutOfBand` rather than `notify`, because the
    // recipient is no longer a member and `notify` would find nobody to tell.
    afterCommit(() => notifyOutOfBand({ actorFk: user.id, regionFk, sourceType: 'membership_removed', userFk }))

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

/** Undo a {@link removeRegionMember}, and erase the event it logged. */
export const restoreRegionMember = authedCommand(
  z.object({
    invitedByFk: z.number().nullable(),
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

    // Scoped to this region: a member can be removed from several of them, and undoing one must
    // not erase the record of the others. Not scoped to the caller either: `assertCanEdit` above
    // lets any admin undo any admin's removal, so pinning the actor would leave the original card
    // next to a member standing right there. `metadata: null` is what keeps it off a revoked
    // invitation, which writes the same verb with the address in metadata.
    await deleteEvent(db, {
      metadata: null,
      object: { id: snapshot.userFk, type: 'user' },
      regionFk: snapshot.regionFk,
      verb: 'remove',
    })

    // And take back the notice the removal queued, which is the whole reason the queue is a row
    // rather than a send.
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
