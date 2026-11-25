import { command, getRequestEvent, query } from '$app/server'
import { reauthCaller } from '$lib/auth/reauth/reauth.server'
import { requireLiveSession } from '$lib/auth/server/session.server'
import { regionInvitations } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { authedQuery, refuseCommand, requireAuthed, requireVerifiedEmail } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import { deleteRegion, previewRegionDeletion } from './delete.server'
import {
  deleteRegionSchema,
  handOverSchema,
  regionFkSchema,
  type RegionInvitationItem,
  type UserInvitationItem,
} from './dto'
import { assertCanEdit, assertIsMember } from './edit.server'
import { acceptInvitation, listInvitationsForEmail, livePredicate } from './invite.server'
import { transferRegionOwnership } from './ownership.server'
import { tagUsage } from './tags.server'

// Writes are mutators (`mutators.server.ts`), except three: `acceptRegionInvitation`, whose page renders
// outside `(app)` with no Zero client, and the owner's hand-over and delete, which spend a re-auth grant.

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

/** Pending invitations for a region. A server query, not Zero: Zero syncs whole rows and
 *  `region_invitations` carries the `token` that joins a region. */
export const listRegionInvitations = authedQuery(
  z.object({ regionFk: z.number() }),
  async ({ regionFk }, ctx): Promise<RegionInvitationItem[]> => {
    // MEMBERSHIP, not admin: a pending invitation holds a seat, so every member runs this for the
    // seat counter. Admin here 403s on every ordinary member's page load.
    assertIsMember(ctx, regionFk)

    const rows = await ctx.db.query.regionInvitations.findMany({
      columns: { email: true, id: true, lastDeliveredAt: true, lastSentAt: true },
      // The same predicate the accept path uses, so a timed-out invitation stops holding a seat.
      where: and(eq(regionInvitations.regionFk, regionFk), livePredicate()),
      with: { invitedBy: { columns: { username: true } } },
    })

    return rows.map((row) => ({
      email: row.email,
      id: row.id,
      invitedBy: row.invitedBy?.username,
      lastDeliveredAt: row.lastDeliveredAt ?? undefined,
      lastSentAt: row.lastSentAt ?? undefined,
    }))
  },
)

/** Accept an invitation. The address comes from the verified token, not `ctx.user`, which is the
 *  `public.users` row and carries none. */
export const acceptRegionInvitation = command(
  z.object({ token: z.uuid() }),
  async ({ token }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const { claims } = requireAuthed()
    await requireLiveSession()

    if (claims.email == null) {
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

export const transferRegionOwnershipCommand = command(handOverSchema, async ({ password, ...target }) => {
  // Only a tab from before re-authentication sends a password.
  if (password !== undefined) refuseCommand(formError('auth_reloadPage'))
  const { email, user } = requireVerifiedEmail()
  const result = await transferRegionOwnership({ email, id: user.id }, target, await reauthCaller())
  if (result.kind === 'reauthRequired') refuseCommand(formError('auth_reauthRequired'), 'code')
})

export const regionDeletionPreview = query(regionFkSchema, ({ regionFk }) =>
  previewRegionDeletion(regionFk, requireAuthed().user.id),
)

export const deleteRegionCommand = command(deleteRegionSchema, async ({ name, password, regionFk }) => {
  if (password !== undefined) refuseCommand(formError('auth_reloadPage'))
  const { user } = requireAuthed()
  const result = await deleteRegion(
    { id: user.id },
    { name, regionFk },
    await reauthCaller(),
    getRequestEvent().url.origin,
  )
  if (result.kind === 'wrongName') refuseCommand(formError('region_deleteWrongName'), 'name')
  if (result.kind === 'reauthRequired') refuseCommand(formError('auth_reauthRequired'), 'code')
})
