import { resolve } from '$app/paths'
import { command, form, getRequestEvent, query } from '$app/server'
import { regionInvitations } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { getLocale } from '$lib/paraglide/runtime'
import {
  authedCommand,
  authedForm,
  authedQuery,
  authedRls,
  refuseCommand,
  requireAuthed,
} from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error, invalid } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import { createRegionForUser, listOwnedRegions } from './create.server'
import { deleteRegion, previewRegionDeletion } from './delete.server'
import {
  deleteRegionSchema,
  handOverSchema,
  invitationSchema,
  inviteMemberSchema,
  MAX_OWNED_REGIONS,
  memberRoleSchema,
  memberSchema,
  regionActionSchema,
  regionCreateSchema,
  regionFkSchema,
  regionMapLayersSchema,
  regionTagSchema,
  removeRegionTagSchema,
  renameRegionTagSchema,
  type RegionInvitationItem,
  type UserInvitationItem,
} from './dto'
import {
  addRegionTagRow,
  assertCanEdit,
  assertIsMember,
  removeRegionTagRow,
  renameRegionTagRow,
  updateRegionMapLayersRow,
  updateRegionRow,
} from './edit.server'
import {
  inviteRegionMemberRow,
  resendRegionInvitationRow,
  restoreRegionInvitationRow,
  revokeRegionInvitationRow,
} from './invitations.server'
import {
  acceptInvitation,
  listInvitationsForEmail,
  livePredicate,
  type DeliveryReport,
  type MailContext,
} from './invite.server'
import {
  leaveRegionRow,
  removeRegionMemberRow,
  restoreRegionMemberRow,
  updateRegionMemberRoleRow,
} from './members.server'
import { transferRegionOwnership } from './ownership.server'
import { tagUsage } from './tags.server'

// The write bodies live in `edit.server.ts`, `invitations.server.ts` and `members.server.ts`,
// shared with the region mutators; these stay one release so tabs loaded before them keep their
// endpoints. The queries and `acceptRegionInvitation` stay for good: the accept page renders
// outside `(app)`, with no Zero client.

/** The request-scoped half of a mail send, so `invite.server.ts` never reaches for
 *  `getRequestEvent()` itself and stays importable from a test. */
const mailContext = (): MailContext => ({ ambientLocale: getLocale(), origin: getRequestEvent().url.origin })

/** An older tab's answer: read once the after-commit send has drained, before Kit serializes it. */
const sentAnswer = (email: string, report: DeliveryReport) => ({
  email,
  get sent() {
    return report.sent
  },
})

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const createRegion = form(
  regionCreateSchema,
  async ({ name }): Promise<MutationResult<{ regionId: number }>> => {
    const { user } = requireAuthed()

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

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateRegion = authedForm(regionActionSchema, (value, ctx) => updateRegionRow(value, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateRegionMapLayers = authedForm(regionMapLayersSchema, (value, ctx) =>
  updateRegionMapLayersRow(value, ctx),
)

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

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const addRegionTag = authedCommand(regionTagSchema, (args, ctx) => addRegionTagRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const renameRegionTag = authedCommand(renameRegionTagSchema, (args, ctx) => renameRegionTagRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const removeRegionTag = authedCommand(removeRegionTagSchema, (args, ctx) => removeRegionTagRow(args, ctx))

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

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const inviteRegionMember = authedForm(inviteMemberSchema, async (value, ctx) => {
  const { data } = await inviteRegionMemberRow(value, ctx, mailContext())
  return { data: sentAnswer(data.email, data.report) }
})

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const resendRegionInvitation = authedCommand(invitationSchema, async (args, ctx) => {
  const { data } = await resendRegionInvitationRow(args, ctx, mailContext())
  return { data: sentAnswer(data.email, data.report) }
})

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const revokeRegionInvitation = authedCommand(invitationSchema, (args, ctx) =>
  revokeRegionInvitationRow(args, ctx),
)

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const restoreRegionInvitation = authedCommand(invitationSchema, (args, ctx) =>
  restoreRegionInvitationRow(args, ctx),
)

/** Accept an invitation. The address comes from the verified token, not `ctx.user`, which is the
 *  `public.users` row and carries none. */
export const acceptRegionInvitation = command(
  z.object({ token: z.uuid() }),
  async ({ token }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const { claims } = requireAuthed()

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

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const acceptMyInvitation = command(
  z.object({ invitationFk: z.number() }),
  async ({ invitationFk }): Promise<MutationResult<{ regionFk: number; regionName: string }>> => {
    const { rls } = await authedRls()
    const claims = getRequestEvent().locals.claims

    if (claims?.email == null) {
      error(401, formError('auth_notSignedIn'))
    }

    const invitation = await rls(async (db) =>
      db.query.regionInvitations.findFirst({
        columns: { token: true },
        where: and(eq(regionInvitations.id, invitationFk), livePredicate()),
      }),
    )

    if (invitation == null) {
      error(404, formError('invite_notFound'))
    }

    return {
      data: await acceptInvitation({ authUserId: claims.sub, email: claims.email, token: invitation.token }),
    }
  },
)

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const updateRegionMemberRole = authedCommand(memberRoleSchema, (args, ctx) =>
  updateRegionMemberRoleRow(args, ctx),
)

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const removeRegionMember = authedCommand(memberSchema, (args, ctx) => removeRegionMemberRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const restoreRegionMember = authedCommand(memberRoleSchema, (args, ctx) => restoreRegionMemberRow(args, ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const leaveRegion = authedCommand(regionFkSchema, (args, ctx) => leaveRegionRow(args, ctx))

/** Hand the region to another admin. The address comes from the verified token, as in
 *  `deleteAccountCommand`, so the password check cannot be pointed at another account. */
export const transferRegionOwnershipCommand = command(handOverSchema, async ({ password, ...target }) => {
  const { claims, user } = requireAuthed()
  if (claims.email == null) error(401, formError('auth_notSignedIn'))

  const result = await transferRegionOwnership({ email: claims.email, id: user.id }, target, password)
  if (result.kind === 'wrongPassword') refuseCommand(formError('settings_passwordIncorrect'), 'password')
})

export const regionDeletionPreview = query(regionFkSchema, ({ regionFk }) =>
  previewRegionDeletion(regionFk, requireAuthed().user.id),
)

export const deleteRegionCommand = command(deleteRegionSchema, async ({ name, password, regionFk }) => {
  const { claims, user } = requireAuthed()
  if (claims.email == null) error(401, formError('auth_notSignedIn'))

  const owner = { email: claims.email, id: user.id }
  const result = await deleteRegion(owner, { name, regionFk }, password, getRequestEvent().url.origin)
  if (result.kind === 'wrongName') refuseCommand(formError('region_deleteWrongName'), 'name')
  if (result.kind === 'wrongPassword') refuseCommand(formError('settings_passwordIncorrect'), 'password')
  return { redirectTo: resolve('/(app)/settings') }
})
