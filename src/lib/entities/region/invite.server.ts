/**
 * The database-backed half of region invitations: create one, accept one, and work out which
 * language to write to the invitee in.
 *
 * Split out of `regions.remote.ts` for the same reason as `guards.server.ts`: a `.remote.ts`
 * module pulls in SvelteKit's client runtime and cannot be imported from a test, and the section 8
 * failure matrix is exactly what is worth testing.
 *
 * One predicate defines validity everywhere - in the RLS policies, in the authGuard hook, in the
 * accept page load and in `acceptInvitation`: **`status = 'pending' AND expires_at > now()`**.
 * Revoking sets `status = 'expired'` and `expires_at = now()` together precisely so that stays the
 * only check anyone has to remember. Nobody spells that predicate out for themselves: every caller
 * comes through `livePredicate`, `findLiveInvitationByEmail` or `resolveInviteState`.
 *
 * Nothing here reads `getRequestEvent()` or `getLocale()`. The request-scoped values the mail needs
 * arrive as a {@link MailContext} instead, which is the whole reason this module stays importable
 * from a test while `regions.remote.ts` does not.
 */
import { db as baseDb } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { regionInvitations, regionMembers, regions, users, userSettings } from '$lib/db/schema'
import { inviteEmailContent } from '$lib/email/invite'
import { sendEmail } from '$lib/email/send.server'
import type { EmailLocale } from '$lib/email/shell'
import { formError } from '$lib/forms/schemas'
import { baseLocale, isLocale } from '$lib/paraglide/runtime'
import { error } from '@sveltejs/kit'
import { and, count, eq, gt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { authUsers } from 'drizzle-orm/supabase'
import z from 'zod'
import { insertActivity } from '../activity/activity.server'
import { acceptPath, type UserInvitationItem, type UserRegion } from './dto'
import { canEditRegion } from './permissions'

type Db = PostgresJsDatabase<typeof schema>

/** How long an invitation stays open. Also stated in the mail copy (`email_inviteMeta`). */
export const INVITE_TTL_DAYS = 7

/** One send per invitation per minute. Seats cap how many invitations exist; this is the only
 *  thing stopping an admin from re-sending in a loop. */
export const RESEND_THROTTLE_MS = 60_000

export interface AcceptInvitationInput {
  authUserId: string
  /** The signed-in session's address, which must match the one the invitation is addressed to. */
  email: string
  token: string
}

export interface CreateInvitationInput {
  email: string
  invitedByFk: number
  regionFk: number
}

/** What the accept page needs to render every state without ever seeing the token again. */
export interface InvitationView {
  email: string
  expired: boolean
  id: number
  /** Username of whoever sent it. Absent only if the inviter's row is gone. */
  inviter: string | undefined
  regionFk: number
  /** Absent when the region has since been deleted, which the page treats as invalid. */
  regionName: string | undefined
  status: 'accepted' | 'expired' | 'pending'
}

/**
 * What the accept screen has to be able to say out loud. A revoked invitation and a timed-out one
 * both land on `invalid`, which is correct: the next step is the same either way, ask the inviter
 * for a new link.
 */
export type InviteState = 'accepted' | 'full' | 'invalid' | 'valid' | 'wrongAccount'

/** Everything the accept page renders from. Deliberately without the token, see
 *  {@link resolveInviteState}. */
export interface InviteStateView {
  inviteEmail: string | undefined
  inviter: string | undefined
  regionName: string | undefined
  sessionEmail: string | undefined
  state: InviteState
}

/**
 * The request-scoped half of a mail send, passed in rather than read here.
 *
 * `getRequestEvent()` only resolves inside a request and `getLocale()` inside paraglide's own
 * scope, so reading either one in this module would put every function that sends mail back out
 * of a test's reach. The caller in `regions.remote.ts` is the adapter that supplies them.
 */
export interface MailContext {
  /** The SENDER's locale. Only ever a fallback, see {@link resolveContactLocale}. */
  ambientLocale: string
  /** Absolute origin the accept link is built on. */
  origin: string
}

/**
 * Turn a token into a membership. One transaction, over the base (non-RLS) `db` for the same
 * reason `signUp` does: the invitee is not a member yet, and `region_members` deliberately has no
 * self-insert policy (see the comment on the table). The token is the authorization and it is
 * validated right here. An RLS insert policy keyed on a matching invitation would be a migration
 * that buys nothing while remote functions are the only write path.
 */
export async function acceptInvitation({ authUserId, email, token }: AcceptInvitationInput): Promise<{
  regionFk: number
  regionName: string
}> {
  const address = normalizeEmail(email)

  return baseDb.transaction(async (tx) => {
    const invitation = await tx.query.regionInvitations.findFirst({
      where: eq(regionInvitations.token, token),
      with: { region: { columns: { maxMembers: true, name: true } } },
    })

    if (invitation == null) {
      error(404, formError('invite_notFound'))
    }

    // The region is gone: nothing left to join, and the row survives because `region_fk` has no
    // cascade. Reads as "not valid", which is the only useful thing to tell the invitee.
    if (invitation.region == null) {
      error(404, formError('invite_notFound'))
    }

    if (invitation.status !== 'pending' || invitation.expiresAt.getTime() <= Date.now()) {
      error(410, formError('invite_alreadyUsed'))
    }

    // An invitation is addressed, not a share link. This is also what makes a forwarded mail
    // useless to whoever received it.
    if (invitation.email !== address) {
      error(403, formError('invite_notFound'))
    }

    const user = await tx.query.users.findFirst({
      columns: { id: true },
      where: eq(users.authUserFk, authUserId),
    })

    if (user == null) {
      error(404, 'User not found')
    }

    const existing = await tx.query.regionMembers.findFirst({
      where: and(eq(regionMembers.regionFk, invitation.regionFk), eq(regionMembers.userFk, user.id)),
    })

    // Already in: a reopened link or a double tap marks the invitation used and returns, rather
    // than adding a second membership.
    if (existing == null) {
      // Active members only, NOT the seat count `createInvitation` uses: this invitation is being
      // consumed, so it must not count against itself. Two invitations racing into the last seat
      // both exist, and this is what refuses the second joiner - leaving their invitation valid so
      // it still works once a seat frees.
      const [{ members }] = await tx
        .select({ members: count() })
        .from(regionMembers)
        .where(and(eq(regionMembers.regionFk, invitation.regionFk), eq(regionMembers.isActive, true)))

      if (members >= invitation.region.maxMembers) {
        error(409, formError('region_seatsFull', { total: invitation.region.maxMembers }))
      }

      await tx.insert(regionMembers).values({
        authUserFk: authUserId,
        invitedByFk: invitation.invitedByFk,
        isActive: true,
        regionFk: invitation.regionFk,
        role: 'region_user',
        userFk: user.id,
      })

      // So the join shows up in the region's audit log, the same shape `removeRegionMember` logs.
      await insertActivity(tx, {
        columnName: 'invitation',
        entityId: user.id,
        entityType: 'user',
        regionFk: invitation.regionFk,
        type: 'updated',
        userFk: user.id,
      })
    }

    await tx
      .update(regionInvitations)
      .set({ acceptedAt: new Date(), acceptedByFk: user.id, status: 'accepted' })
      .where(eq(regionInvitations.id, invitation.id))

    return { regionFk: invitation.regionFk, regionName: invitation.region.name }
  })
}

/** Throws 429 when the last send is too recent. Split out so a test can drive it without a clock. */
export function assertResendAllowed(lastSentAt: Date | null, now = Date.now()) {
  if (lastSentAt != null && now - lastSentAt.getTime() < RESEND_THROTTLE_MS) {
    error(429, formError('region_inviteResendWait'))
  }
}

/**
 * Create (or refresh) an invitation. Runs on the caller's RLS transaction, where the admin
 * INSERT/UPDATE policies on `region_invitations` apply.
 */
export async function createInvitation(
  db: Db,
  { email, invitedByFk, regionFk }: CreateInvitationInput,
): Promise<{ id: number; token: string }> {
  // Trim and lowercase, nothing else. `+` aliases are deliberately left alone: they are
  // different addresses, and GoTrue treats them as such too.
  const address = normalizeEmail(email)

  // Members plus live invitations, the same rule `seatState` shows on the screen, so the two
  // cannot disagree about whether there is room.
  const [region, [{ members }], [{ invitations }]] = await Promise.all([
    db.query.regions.findFirst({ columns: { maxMembers: true }, where: eq(regions.id, regionFk) }),

    db
      .select({ members: count() })
      .from(regionMembers)
      .where(and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true))),

    db
      .select({ invitations: count() })
      .from(regionInvitations)
      .where(and(eq(regionInvitations.regionFk, regionFk), livePredicate())),
  ])

  if (region == null) {
    error(404, 'Region not found')
  }

  if (members + invitations >= region.maxMembers) {
    error(409, formError('region_seatsFull', { total: region.maxMembers }))
  }

  // Skipping this would leave a pending row that can never resolve into anything.
  if (await isActiveMemberByEmail(regionFk, address)) {
    error(409, formError('region_inviteAlreadyMember'))
  }

  // Reuse rather than stack: there is no unique constraint on (region, email) to lean on, and a
  // double submit or a re-invite should read as a resend of the link already in their inbox.
  const existing = await db.query.regionInvitations.findFirst({
    where: and(eq(regionInvitations.regionFk, regionFk), eq(regionInvitations.email, address), livePredicate()),
  })

  if (existing != null) {
    await db.update(regionInvitations).set({ expiresAt: expiry() }).where(eq(regionInvitations.id, existing.id))
    return { id: existing.id, token: existing.token }
  }

  const [created] = await db
    .insert(regionInvitations)
    .values({ email: address, expiresAt: expiry(), invitedByFk, regionFk, token: crypto.randomUUID() })
    .returning({ id: regionInvitations.id, token: regionInvitations.token })

  return created
}

/** `now + INVITE_TTL_DAYS`. */
export function expiry(from = Date.now()): Date {
  return new Date(from + INVITE_TTL_DAYS * 86_400_000)
}

/**
 * The live invitation addressed to `email`, if there is one. What the authGuard bounce asks before
 * sending a region-less user straight to the invitation rather than to an empty map.
 *
 * Exists so the hook does not have to name the validity predicate or the address normalization for
 * itself. It did both, and its `.toLowerCase()` was not `normalizeEmail`, so a stored address with
 * stray whitespace matched every other path and missed this one.
 *
 * Over the base `db`: the hook runs before there is an RLS transaction to speak of.
 */
export async function findLiveInvitationByEmail(email: string): Promise<undefined | { token: string }> {
  return baseDb.query.regionInvitations.findFirst({
    columns: { token: true },
    where: and(eq(regionInvitations.email, normalizeEmail(email)), livePredicate()),
  })
}

/** Whether the region has room for one more member. The accept-side seat rule (live invitations
 *  do not count, the one being accepted is about to be consumed). */
export async function hasFreeSeat(regionFk: number): Promise<boolean> {
  const [region, [{ members }]] = await Promise.all([
    baseDb.query.regions.findFirst({ columns: { maxMembers: true }, where: eq(regions.id, regionFk) }),

    baseDb
      .select({ members: count() })
      .from(regionMembers)
      .where(and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true))),
  ])

  return region != null && members < region.maxMembers
}

/**
 * Every live invitation addressed to `email`, for the invitee's own settings screen.
 *
 * The safety net for the whole flow: the emailed link is one click away from being lost (mail
 * deleted, opened on the wrong device, link gone stale in a tab), and an invitee who is already a
 * member of some other region never trips the authGuard bounce, which only fires on zero regions.
 *
 * Over the base `db` for the region name: an invitee is not a member of that region yet, and
 * `regions` is only selectable by its active members, so the joined name would come back empty on
 * the caller's RLS transaction. The `token` deliberately stays here, same as `listRegionInvitations`.
 */
export async function listInvitationsForEmail(email: string): Promise<UserInvitationItem[]> {
  const rows = await baseDb.query.regionInvitations.findMany({
    columns: { id: true },
    where: and(eq(regionInvitations.email, normalizeEmail(email)), livePredicate()),
    with: { invitedBy: { columns: { username: true } }, region: { columns: { name: true } } },
  })

  // A region that has since been deleted leaves its invitation behind (`region_fk` has no
  // cascade). There is nothing left to join, so it is not offered.
  return rows.flatMap((row) =>
    row.region == null ? [] : [{ id: row.id, invitedBy: row.invitedBy?.username, regionName: row.region.name }],
  )
}

/** The one definition of a live invitation, as a drizzle predicate. */
export function livePredicate(now = new Date()) {
  return and(eq(regionInvitations.status, 'pending'), gt(regionInvitations.expiresAt, now))
}

/**
 * Read an invitation by token for the accept page. Over the base `db` on purpose: an anonymous
 * visitor cannot see the row under RLS, and the token is what authorizes the read.
 */
export async function loadInvitation(token: string): Promise<InvitationView | undefined> {
  // `token` is a uuid column, so anything that is not a uuid makes Postgres throw rather than
  // simply miss. A truncated or hand-typed link is exactly how that arrives, and it has to read
  // as "not valid" like every other unusable token, not as a 500.
  if (!z.uuid().safeParse(token).success) {
    return undefined
  }

  const invitation = await baseDb.query.regionInvitations.findFirst({
    where: eq(regionInvitations.token, token),
    with: { invitedBy: { columns: { username: true } }, region: { columns: { name: true } } },
  })

  if (invitation == null) {
    return undefined
  }

  return {
    email: invitation.email,
    expired: invitation.expiresAt.getTime() <= Date.now(),
    id: invitation.id,
    inviter: invitation.invitedBy?.username,
    regionFk: invitation.regionFk,
    regionName: invitation.region?.name,
    status: invitation.status,
  }
}

/** Trim and lowercase. The one normalization every path applies to an address. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Re-send an existing invitation with a refreshed expiry. Throttled to one send per minute.
 *
 * The lookup is deliberately not predicate-filtered, so this also puts a revoked invitation back
 * to `pending`. The screen never offers it (the list it renders is filtered), which leaves this
 * reachable only by calling it directly. Behaviour preserved from when it lived in
 * `regions.remote.ts`; change it here if it should refuse instead.
 */
export async function resendInvitation(
  db: Db,
  // `inviter` is whoever hit Resend, not whoever sent the original. That is what the mail names,
  // and it is the person the invitee would reply to.
  { invitationFk, inviter, userRegions }: { invitationFk: number; inviter: string; userRegions: UserRegion[] },
  mail: MailContext,
): Promise<{ email: string; sent: boolean }> {
  const invitation = await loadEditable(db, invitationFk, userRegions)

  if (invitation.region == null) {
    error(404, 'Invitation not found')
  }

  assertResendAllowed(invitation.lastSentAt)

  await db
    .update(regionInvitations)
    .set({ expiresAt: expiry(), status: 'pending' })
    .where(eq(regionInvitations.id, invitationFk))

  const sent = await sendInvitationEmail(
    db,
    {
      email: invitation.email,
      id: invitationFk,
      // The throttle already caps this at one a minute, so the clock is fine as the varying part.
      idempotencyKey: `invitation-${invitationFk}-${Date.now()}`,
      inviter,
      regionName: invitation.region.name,
      token: invitation.token,
    },
    mail,
  )

  // The first send may have failed, in which case nothing logged the invitation and this is the
  // moment it reaches somebody. When the first send did work, `insertActivity` collapses this
  // onto that row rather than adding a second card: same actor, region, column and address.
  if (sent) {
    await insertActivity(db, {
      columnName: 'invitation',
      entityId: invitation.invitedByFk,
      entityType: 'user',
      newValue: invitation.email,
      regionFk: invitation.regionFk,
      type: 'created',
      userFk: invitation.invitedByFk,
    })
  }

  return { email: invitation.email, sent }
}

/**
 * Which language to write to `email` in.
 *
 * The stored `contact_locale` of the account on that address wins, because it is a language that
 * person actually chose. Otherwise the caller's ambient locale - which for an invitee with no
 * account is the only signal there is. That is exactly what the shell's `locale` doc warns
 * against, and it is deliberate here: a wrong guess costs one paragraph in the wrong language,
 * and the accept page localizes itself from the invitee's own browser anyway.
 *
 * Over the base `db`: `user_settings` is readable only by its owner under RLS, and the sender is
 * never the recipient.
 */
export async function resolveContactLocale(email: string, ambient?: string): Promise<EmailLocale> {
  const [row] = await baseDb
    .select({ contactLocale: userSettings.contactLocale })
    .from(userSettings)
    .innerJoin(authUsers, eq(authUsers.id, userSettings.authUserFk))
    .where(eq(authUsers.email, normalizeEmail(email)))
    .limit(1)

  return asLocale(row?.contactLocale) ?? asLocale(ambient) ?? baseLocale
}

/**
 * Resolve a token and whoever is signed in into the one state the accept screen renders from.
 *
 * The order is load-bearing, which is why this is here and not in the route's `load`. `accepted`
 * comes before the expiry check, so a link that was used and then timed out still reads as used
 * rather than as broken. `wrongAccount` comes before the seat check, so an invitee is told which
 * account to be on before being told there is no room for it.
 *
 * The token is deliberately NOT returned: the page already has it in its own URL, and echoing it
 * into the payload would put a join credential into every SSR response body and client-side cache
 * of this page.
 */
export async function resolveInviteState(
  token: null | string | undefined,
  sessionEmail: string | undefined,
): Promise<InviteStateView> {
  const invitation = token == null ? undefined : await loadInvitation(token)

  const base = {
    inviteEmail: invitation?.email,
    inviter: invitation?.inviter,
    regionName: invitation?.regionName,
    sessionEmail,
  }

  // Unknown token, or a region that has since been deleted (the invitation row survives, its
  // `region_fk` has no cascade).
  if (invitation == null || invitation.regionName == null) {
    return { ...base, state: 'invalid' }
  }

  if (invitation.status === 'accepted') {
    return { ...base, state: 'accepted' }
  }

  if (invitation.status === 'expired' || invitation.expired) {
    return { ...base, state: 'invalid' }
  }

  // An invitation is addressed, not a share link. Same comparison `acceptInvitation` makes, which
  // is what refuses a forwarded mail on the server too.
  if (sessionEmail != null && normalizeEmail(sessionEmail) !== invitation.email) {
    return { ...base, state: 'wrongAccount' }
  }

  // The region can fill up between invite and accept, and the invite is not the gate, joining is.
  // The invitation stays valid, so the link works again once a seat frees.
  if (!(await hasFreeSeat(invitation.regionFk))) {
    return { ...base, state: 'full' }
  }

  return { ...base, state: 'valid' }
}

/** Undo a {@link revokeInvitation}: back to pending with a fresh expiry, same token. Returns what
 *  the caller needs to erase the activity the revoke logged. */
export async function restoreInvitation(
  db: Db,
  invitationFk: number,
  userRegions: UserRegion[],
): Promise<{ email: string; regionFk: number }> {
  const invitation = await loadEditable(db, invitationFk, userRegions)

  await db
    .update(regionInvitations)
    .set({ expiresAt: expiry(), status: 'pending' })
    .where(eq(regionInvitations.id, invitationFk))

  return { email: invitation.email, regionFk: invitation.regionFk }
}

/**
 * Withdraw an invitation. An update, not a delete: `region_invitations` has admin INSERT and
 * UPDATE policies but no DELETE one, so a delete would need a migration to allow what an update
 * already expresses. Setting both columns together keeps `pending AND not expired` the only
 * validity check anyone has to remember.
 */
export async function revokeInvitation(
  db: Db,
  invitationFk: number,
  userRegions: UserRegion[],
): Promise<{ email: string; regionFk: number }> {
  const invitation = await loadEditable(db, invitationFk, userRegions)

  await db
    .update(regionInvitations)
    .set({ expiresAt: new Date(), status: 'expired' })
    .where(eq(regionInvitations.id, invitationFk))

  return { email: invitation.email, regionFk: invitation.regionFk }
}

/**
 * Send the invitation mail for `id`, and record that we did.
 *
 * Shared by the invite form and {@link resendInvitation} so the two can never build a different URL
 * or pick a different locale. `sendEmail` returns false instead of throwing, so the caller gets the
 * outcome and can say "invitation saved, mail did not go out" rather than losing the row.
 */
export async function sendInvitationEmail(
  db: Db,
  {
    email,
    id,
    /**
     * Stable (`invitation-<id>`) for an invite, so a double submit that slips past the disabled
     * button sends one mail. Varying for a resend, which is a deliberate second send that Resend
     * would otherwise swallow as a duplicate.
     */
    idempotencyKey,
    inviter,
    regionName,
    token,
  }: { email: string; id: number; idempotencyKey: string; inviter: string; regionName: string; token: string },
  { ambientLocale, origin }: MailContext,
): Promise<boolean> {
  const locale = await resolveContactLocale(email, ambientLocale)
  const sentAt = new Date()

  const sent = await sendEmail({
    ...inviteEmailContent({ inviter, locale, regionName, url: `${origin}${acceptPath(token)}` }),
    idempotencyKey,
    locale,
    origin,
    to: email,
  })

  // Recorded even when the send failed: the throttle exists to stop a loop, and a failing
  // provider is the one case where a loop is most likely.
  await db.update(regionInvitations).set({ lastSentAt: sentAt }).where(eq(regionInvitations.id, id))

  return sent
}

function asLocale(value: null | string | undefined): EmailLocale | undefined {
  return value != null && isLocale(value) ? value : undefined
}

/** Whether the address belongs to an account that is already an active member of the region.
 *  Over the base `db`: `auth.users` is not readable by the `authenticated` role. */
async function isActiveMemberByEmail(regionFk: number, email: string): Promise<boolean> {
  const [member] = await baseDb
    .select({ id: regionMembers.id })
    .from(regionMembers)
    .innerJoin(authUsers, eq(authUsers.id, regionMembers.authUserFk))
    .where(and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true), eq(authUsers.email, email)))
    .limit(1)

  return member != null
}

/**
 * An invitation the caller may administer, or a throw. The find, the 404 and the permission check
 * that every invitation command starts with, in one place so the three cannot drift apart on which
 * of them they remember to do.
 *
 * Deliberately NOT predicate-filtered: revoke and restore both act on rows that are not live, by
 * definition. The region relation comes along because resend needs the name and one join is
 * cheaper than a second lookup.
 */
async function loadEditable(db: Db, invitationFk: number, userRegions: UserRegion[]) {
  const invitation = await db.query.regionInvitations.findFirst({
    where: eq(regionInvitations.id, invitationFk),
    with: { region: { columns: { name: true } } },
  })

  if (invitation == null) {
    error(404, 'Invitation not found')
  }

  if (!canEditRegion(userRegions, invitation.regionFk)) {
    error(403, formError('form_noPermission'))
  }

  return invitation
}
