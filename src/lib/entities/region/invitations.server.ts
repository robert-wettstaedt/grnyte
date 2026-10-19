import * as schema from '$lib/db/schema'
import { regionInvitations, regions } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deleteEvent, insertEvent } from '../event/event.server'
import type { inviteMemberSchema, RevokedInvitationSnapshot } from './dto'
import { assertCanEdit } from './edit.server'
import {
  acceptInvitationIn,
  createInvitation,
  livePredicate,
  normalizeEmail,
  resendInvitation,
  restoreInvitation,
  revokeInvitation,
  sendInvitationEmail,
  type DeliveryReport,
  type MailContext,
} from './invite.server'

type Caller = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>

/**
 * Accept an invitation from the in-app list, which knows the row id but never the token. Runs
 * privileged; the gate is the address, matched here and again in `acceptInvitationIn`.
 */
export async function acceptMyInvitationRow(
  { invitationFk }: { invitationFk: number },
  {
    afterCommit,
    authUserId,
    db,
    email,
  }: Pick<Context, 'afterCommit'> & {
    authUserId: string
    db: PostgresJsDatabase<typeof schema>
    email: string | undefined
  },
) {
  if (email == null) {
    error(401, formError('auth_notSignedIn'))
  }

  const invitation = await db.query.regionInvitations.findFirst({
    columns: { token: true },
    // Scoped to the caller's own address, as RLS scoped it: otherwise 404 against 403 tells a
    // caller which ids are somebody else's live invitations.
    where: and(
      eq(regionInvitations.id, invitationFk),
      eq(regionInvitations.email, normalizeEmail(email)),
      livePredicate(),
    ),
  })

  if (invitation == null) {
    error(404, formError('invite_notFound'))
  }

  return { data: await acceptInvitationIn(db, { authUserId, email, token: invitation.token }, afterCommit) }
}

/** Invite an address to a region and mail them the link after commit. A mutator answers before
 *  the send, so its screen reads delivery off the invitation row. */
export async function inviteRegionMemberRow(
  { email, regionFk }: z.output<typeof inviteMemberSchema>,
  ctx: Caller,
  mail: MailContext,
) {
  const { afterCommit, db, user } = ctx
  assertCanEdit(ctx, regionFk)

  const region = await db.query.regions.findFirst({ columns: { name: true }, where: eq(regions.id, regionFk) })
  if (region == null) {
    error(404, formError('region_notFound'))
  }

  const address = normalizeEmail(email)
  const invitation = await createInvitation(db, { email: address, invitedByFk: user.id, regionFk })
  const report: DeliveryReport = { sent: false }

  await sendInvitationEmail(
    db,
    {
      actorFk: user.id,
      email: address,
      id: invitation.id,
      idempotencyKey: () => `invitation-${invitation.id}`,
      inviter: user.username,
      // Logged only once the mail went out: ahead of it, "You invited ..." landed in the log for a
      // mail nobody received. `resendInvitation` checks the log so a resend never re-announces.
      // `subject_fk` holds the INVITER: the invitee has no account to point at. The address is in
      // `metadata`, which is what the card renders and what keeps two invitations apart.
      onDelivered: (handle) =>
        insertEvent(handle, {
          actorFk: user.id,
          metadata: address,
          object: { id: user.id, type: 'user' },
          regionFk,
          verb: 'invite',
        }),
      regionFk,
      regionName: region.name,
      report,
      token: invitation.token,
    },
    mail,
    afterCommit,
  )

  return { data: { email: address, report } }
}

/** Re-send an existing invitation with a refreshed expiry. Throttled to one send per minute. */
export async function resendRegionInvitationRow(
  { invitationFk }: { invitationFk: number },
  { afterCommit, db, user, userRegions }: Caller,
  mail: MailContext,
) {
  const { email, report } = await resendInvitation(
    db,
    { invitationFk, inviter: user.username, inviterFk: user.id, userRegions },
    mail,
    afterCommit,
  )

  return { data: { email, report } }
}

/** Undo a {@link revokeRegionInvitationRow}: back to pending with a fresh expiry, same token, and
 *  erase the event the revoke logged. */
export async function restoreRegionInvitationRow(
  { invitationFk }: { invitationFk: number },
  { db, userRegions }: Pick<Context, 'db' | 'userRegions'>,
) {
  const { email, regionFk } = await restoreInvitation(db, invitationFk, userRegions)

  // Keyed on the address, not on who revoked it: any admin may undo any admin's revoke, and
  // pinning the caller would leave a "revoked" card beside a live invitation.
  await deleteEvent(db, { metadata: email, regionFk, verb: 'remove' })
}

/** Withdraw an invitation. See {@link revokeInvitation} for why it is an update, not a delete. */
export async function revokeRegionInvitationRow(
  { invitationFk }: { invitationFk: number },
  { afterCommit, db, user, userRegions }: Caller,
) {
  const { email, regionFk } = await revokeInvitation(db, invitationFk, userRegions, afterCommit)

  // `subject_fk` holds the ACTOR and the address is in `metadata`. That pair is what tells this
  // apart from `removeRegionMember`, which writes the same verb: never read the verb alone.
  await insertEvent(db, {
    actorFk: user.id,
    metadata: email,
    object: { id: user.id, type: 'user' },
    regionFk,
    verb: 'remove',
  })

  return { data: { invitationFk } satisfies RevokedInvitationSnapshot }
}
