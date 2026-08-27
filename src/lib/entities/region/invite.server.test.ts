// @vitest-environment node
/**
 * The invitation failure matrix, driven directly against `createInvitation` and
 * `acceptInvitation`. The happy path is the Playwright spec's job (`e2e/invite.spec.ts`); driving
 * fifteen refusals through a browser is slow and proves nothing extra.
 *
 * Real database, real fixtures, over the superuser connection (RLS bypassed) exactly like
 * `guards.server.test.ts`: these are app rules, not policies, and every one of them is a query.
 *
 * The mail is covered here too, as data: the browser test never opens the invite mail (it goes to
 * a real inbox), so this is where the accept URL, the region, the inviter and the recipient locale
 * are actually asserted.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { inviteEmailContent } from '$lib/email/invite'
import type { SendEmailInput } from '$lib/email/send.server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRegion } from './dto'
import {
  acceptInvitation,
  assertResendAllowed,
  createInvitation,
  findLiveInvitationByEmail,
  hasFreeSeat,
  listInvitationsForEmail,
  loadInvitation,
  RESEND_THROTTLE_MS,
  resendInvitation,
  resolveContactLocale,
  resolveInviteState,
  restoreInvitation,
  revokeInvitation,
} from './invite.server'

/**
 * The one mock in this file. `.env` carries a live `RESEND_API_KEY` (the Playwright spec needs
 * one), so an unmocked `resendInvitation` would mail a real person on every `npm test`. Capturing
 * the payload is the point anyway: it is what makes the accept URL, the recipient and the
 * idempotency key assertable without an inbox.
 */
const mail = vi.hoisted(() => ({ result: true, sent: [] as SendEmailInput[] }))

vi.mock('$lib/email/send.server', () => ({
  sendEmail: async (input: SendEmailInput) => {
    mail.sent.push(input)
    return mail.result
  },
}))

const REGION = '__invite_region__'

const EMAILS = {
  /** Sole admin of the fixture region, and the inviter in every test. */
  admin: 'maintainer@grnyte.rocks',
  /** The invitee. Never seeded as a member, so they can actually be invited. */
  invitee: 'user@grnyte.rocks',
  /** Already a member: the "address is already in the region" refusal. */
  member: 'admin@grnyte.rocks',
} as const

type Who = keyof typeof EMAILS

let users = {} as Record<Who, SeedUser>
let regionId = 0

/** What `regions.remote.ts` reads off the request. Fixed here, which is the whole point of it
 *  being an argument. */
const MAIL = { ambientLocale: 'en', origin: 'http://localhost:3000' }

/** The caller's memberships, as `canEditRegion` wants them. `adminOf()` may administer the fixture
 *  region; `[]` is anybody else, which is what the 403 cases pass. */
const adminOf = (fk = regionId): UserRegion[] => [
  { name: REGION, permissions: ['region.admin'], regionFk: fk, role: 'region_admin', settings: undefined },
]

async function accept(token: string, who: Who = 'invitee') {
  return acceptInvitation({ authUserId: users[who].authId, email: EMAILS[who], token })
}

async function invite(email: string = EMAILS.invitee) {
  return createInvitation(db, { email, invitedByFk: users.admin.userId, regionFk: regionId })
}

async function removeFixtures() {
  // Accepting an invitation tells the inviter, so the fixture region owns notification rows too.
  await sql`delete from public.notifications where region_fk in (select id from public.regions where name = ${REGION})`
  // Accepting also writes an event, which references the region: it has to go first. `changes`
  // and `reactions` hang off the event and cascade with it.
  await sql`delete from public.events where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.region_invitations where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = ${REGION})`
  await sql`delete from public.regions where name = ${REGION}`
}

/** admin@ administers the region, member@ is in it, invitee@ is not. Ten seats unless a test
 *  narrows them. */
async function reset() {
  // Before the events: accepting an invitation notifies the inviter, and a resend now queues a
  // push for an invitee who already has an account. Both are rows in this region, and left behind
  // they accumulate across the file.
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.region_invitations where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`update public.regions set max_members = 10 where id = ${regionId}`
  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk) values
      (${regionId}, 'region_admin', true, ${users.admin.authId}, ${users.admin.userId}),
      (${regionId}, 'region_user', true, ${users.member.authId}, ${users.member.userId})`
  await sql`update public.user_settings set contact_locale = null where user_fk = ${users.invitee.userId}`
}

/** Every queued push about this region's invitations. Queue-only rows: nobody can read them, and
 *  the cron is the only reader, so they are asserted over the privileged connection. */
const queued = () => sql<{ userFk: number }[]>`
  select user_fk as "userFk" from public.notifications
  where region_fk = ${regionId} and source_type = 'invitation_received'`

/** The status code SvelteKit's `error()` threw, or 0 when the call resolved. */
async function statusOf(promise: Promise<unknown>): Promise<number> {
  return promise.then(
    () => 0,
    (cause) => (cause as { status?: number }).status ?? -1,
  )
}

beforeAll(async () => {
  if (!reachable) return

  users = await seedUsers(EMAILS)

  await removeFixtures()
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members)
    values (${REGION}, ${users.admin.userId}, 10) returning id`
}, 30_000)

beforeEach(async () => {
  mail.sent.length = 0
  mail.result = true
  if (reachable) await reset()
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('createInvitation', () => {
  it('normalizes the address it stores', async () => {
    const { id } = await invite(`  ${EMAILS.invitee.toUpperCase()}  `)

    const [row] = await sql<{ email: string }[]>`select email from public.region_invitations where id = ${id}`
    expect(row.email).toBe(EMAILS.invitee)
  })

  it('reuses the existing invitation and its token rather than stacking duplicates', async () => {
    const first = await invite()
    await sql`update public.region_invitations set expires_at = now() + interval '1 hour' where id = ${first.id}`

    const second = await invite()

    expect(second.id).toBe(first.id)
    expect(second.token).toBe(first.token)

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*) from public.region_invitations where region_fk = ${regionId}`
    expect(Number(count)).toBe(1)

    // Refreshed, so a resend of the same link buys the invitee the full window again.
    const [row] = await sql<{ expiresAt: Date }[]>`
      select expires_at as "expiresAt" from public.region_invitations where id = ${first.id}`
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000)
  })

  it('refuses when the region is full, counting live invitations as taken seats', async () => {
    // Two members, three seats: one invitation fits, the second does not.
    await sql`update public.regions set max_members = 3 where id = ${regionId}`
    await invite()

    expect(await statusOf(invite('somebody-else@grnyte.rocks'))).toBe(409)
  })

  it('refuses an address that is already an active member', async () => {
    expect(await statusOf(invite(EMAILS.member))).toBe(409)
  })

  it('ignores a timed-out invitation when counting seats and when reusing', async () => {
    await sql`update public.regions set max_members = 3 where id = ${regionId}`
    const stale = await invite()
    await sql`update public.region_invitations set expires_at = now() - interval '1 day' where id = ${stale.id}`

    const fresh = await invite()
    expect(fresh.id).not.toBe(stale.id)
  })
})

describe.skipIf(!reachable)('acceptInvitation', () => {
  it('adds the member as region_user, carries the inviter over and marks the invitation used', async () => {
    const { id, token } = await invite()

    await expect(accept(token)).resolves.toMatchObject({ regionFk: regionId })

    const [member] = await sql<{ invitedBy: number; isActive: boolean; role: string }[]>`
      select role, is_active as "isActive", invited_by as "invitedBy"
      from public.region_members where region_fk = ${regionId} and user_fk = ${users.invitee.userId}`
    expect(member).toMatchObject({ invitedBy: users.admin.userId, isActive: true, role: 'region_user' })

    const [invitation] = await sql<{ acceptedBy: number; status: string }[]>`
      select status, accepted_by as "acceptedBy" from public.region_invitations where id = ${id}`
    expect(invitation).toMatchObject({ acceptedBy: users.invitee.userId, status: 'accepted' })

    // The join shows up in the region's log as an `accept`, not a role change: accepting closes
    // out the invitation. Subject and actor are the same person, which is what accepting means.
    const [{ count }] = await sql<{ count: string }[]>`
      select count(*) from public.events
      where region_fk = ${regionId} and verb = 'accept'
        and subject_fk = ${users.invitee.userId} and actor_fk = ${users.invitee.userId}`
    expect(Number(count)).toBe(1)
  })

  it('is a no-op for somebody already in the region, rather than a duplicate membership', async () => {
    const { id, token } = await invite()
    await accept(token)

    // A used link is spent, so reopening it says so.
    expect(await statusOf(accept(token))).toBe(410)

    // A second live invitation for somebody who has since joined (a re-invite, or a link that was
    // still open in another tab) resolves instead of adding a second membership.
    await sql`
      update public.region_invitations
      set status = 'pending', accepted_at = null, accepted_by = null, expires_at = now() + interval '7 days'
      where id = ${id}`
    await expect(accept(token)).resolves.toMatchObject({ regionFk: regionId })

    const [{ count }] = await sql<{ count: string }[]>`
      select count(*) from public.region_members
      where region_fk = ${regionId} and user_fk = ${users.invitee.userId}`
    expect(Number(count)).toBe(1)
  })

  it('refuses an unknown token', async () => {
    expect(await statusOf(accept('00000000-0000-4000-8000-000000000000'))).toBe(404)
  })

  it('refuses a timed-out invitation', async () => {
    const { id, token } = await invite()
    await sql`update public.region_invitations set expires_at = now() - interval '1 day' where id = ${id}`

    expect(await statusOf(accept(token))).toBe(410)
  })

  it('refuses a revoked invitation, identically to a timed-out one', async () => {
    const { id, token } = await invite()
    await sql`update public.region_invitations set status = 'expired', expires_at = now() where id = ${id}`

    expect(await statusOf(accept(token))).toBe(410)
  })

  it('refuses an account whose address is not the invited one', async () => {
    const { token } = await invite()

    // What makes a forwarded invitation useless to whoever received it.
    expect(await statusOf(accept(token, 'member'))).toBe(403)
  })

  it('reads a malformed token as unknown rather than letting Postgres throw', async () => {
    // `token` is a uuid column: without the guard this is a 500 on the accept page, not the
    // "invitation not valid" screen a truncated link is supposed to land on.
    expect(await loadInvitation('not-a-real-token')).toBeUndefined()
  })

  it('refuses when the region filled up in between, and leaves the invitation valid', async () => {
    const { id, token } = await invite()
    await sql`update public.regions set max_members = 2 where id = ${regionId}`

    expect(await statusOf(accept(token))).toBe(409)

    const [row] = await sql<{ status: string }[]>`select status from public.region_invitations where id = ${id}`
    expect(row.status).toBe('pending')
    expect(await hasFreeSeat(regionId)).toBe(false)
  })
})

describe.skipIf(!reachable)('listInvitationsForEmail', () => {
  it('lists the live invitation with its region and inviter, whatever case the address is in', async () => {
    const { id } = await invite()
    const [{ username: inviterName }] = await sql<{ username: string }[]>`
      select username from public.users where id = ${users.admin.userId}`

    // toEqual, not toMatchObject, so a leaked extra field (the token above all) still fails.
    await expect(listInvitationsForEmail(EMAILS.invitee.toUpperCase())).resolves.toEqual([
      { id, invitedBy: inviterName, regionName: REGION },
    ])
  })

  it('leaves out an invitation that has been used or has timed out', async () => {
    const { id, token } = await invite()
    await sql`update public.region_invitations set expires_at = now() - interval '1 day' where id = ${id}`

    expect(await listInvitationsForEmail(EMAILS.invitee)).toEqual([])

    await sql`update public.region_invitations set expires_at = now() + interval '1 day' where id = ${id}`
    await accept(token)

    expect(await listInvitationsForEmail(EMAILS.invitee)).toEqual([])
  })
})

describe.skipIf(!reachable)('findLiveInvitationByEmail', () => {
  it('finds the live invitation whatever whitespace and case the address arrives in', async () => {
    const { token } = await invite()

    // The authGuard bounce used to normalize with a bare `.toLowerCase()`, so a padded address
    // matched every other path and missed that one.
    await expect(findLiveInvitationByEmail(`  ${EMAILS.invitee.toUpperCase()}  `)).resolves.toMatchObject({ token })
  })

  it('ignores a used or timed-out invitation, the same predicate as everywhere else', async () => {
    const { id, token } = await invite()
    await sql`update public.region_invitations set expires_at = now() - interval '1 day' where id = ${id}`

    expect(await findLiveInvitationByEmail(EMAILS.invitee)).toBeUndefined()

    await sql`update public.region_invitations set expires_at = now() + interval '1 day' where id = ${id}`
    await accept(token)

    expect(await findLiveInvitationByEmail(EMAILS.invitee)).toBeUndefined()
  })
})

describe.skipIf(!reachable)('resolveInviteState', () => {
  it('is valid for the invited address, and never echoes the token back', async () => {
    const { token } = await invite()

    const state = await resolveInviteState(token, EMAILS.invitee)

    expect(state).toMatchObject({ inviteEmail: EMAILS.invitee, regionName: REGION, state: 'valid' })
    // The page has the token in its own URL already. Putting it in the payload would cache a join
    // credential in every SSR response body.
    expect(JSON.stringify(state)).not.toContain(token)
  })

  it('is valid for a signed-out visitor, who has yet to pick an account', async () => {
    const { token } = await invite()

    await expect(resolveInviteState(token, undefined)).resolves.toMatchObject({ state: 'valid' })
  })

  it('reads a missing, malformed or unknown token as invalid rather than throwing', async () => {
    for (const token of [null, undefined, 'not-a-real-token', '00000000-0000-4000-8000-000000000000']) {
      await expect(resolveInviteState(token, EMAILS.invitee)).resolves.toMatchObject({ state: 'invalid' })
    }
  })

  it('presents a revoked invitation exactly like a timed-out one', async () => {
    const { id, token } = await invite()
    await revokeInvitation(db, id, adminOf())

    const revoked = await resolveInviteState(token, EMAILS.invitee)

    await sql`update public.region_invitations set status = 'pending', expires_at = now() - interval '1 day' where id = ${id}`

    expect(revoked.state).toBe('invalid')
    expect((await resolveInviteState(token, EMAILS.invitee)).state).toBe('invalid')
  })

  it('says wrongAccount when the session is somebody else, ignoring case', async () => {
    const { token } = await invite()

    await expect(resolveInviteState(token, EMAILS.member)).resolves.toMatchObject({ state: 'wrongAccount' })
    // Normalized on both sides, or every invitee whose mail client capitalizes gets bounced.
    await expect(resolveInviteState(token, EMAILS.invitee.toUpperCase())).resolves.toMatchObject({ state: 'valid' })
  })

  it('says full when the region filled up in between', async () => {
    const { token } = await invite()
    await sql`update public.regions set max_members = 2 where id = ${regionId}`

    await expect(resolveInviteState(token, EMAILS.invitee)).resolves.toMatchObject({ state: 'full' })
  })

  it('keeps its branch order: accepted beats expired, wrongAccount beats full', async () => {
    const { id, token } = await invite()
    await accept(token)

    // Used and then timed out still reads as used, not as broken.
    await sql`update public.region_invitations set expires_at = now() - interval '1 day' where id = ${id}`
    await expect(resolveInviteState(token, EMAILS.invitee)).resolves.toMatchObject({ state: 'accepted' })

    // Tell somebody which account to be on before telling them there is no room for it.
    await sql`
      update public.region_invitations
      set status = 'pending', accepted_at = null, accepted_by = null, expires_at = now() + interval '7 days'
      where id = ${id}`
    await sql`update public.regions set max_members = 1 where id = ${regionId}`
    await expect(resolveInviteState(token, EMAILS.member)).resolves.toMatchObject({ state: 'wrongAccount' })
  })
})

describe.skipIf(!reachable)('revokeInvitation / restoreInvitation', () => {
  it('round-trips through expired and back, keeping the same token', async () => {
    const { id, token } = await invite()

    await revokeInvitation(db, id, adminOf())
    expect(await findLiveInvitationByEmail(EMAILS.invitee)).toBeUndefined()
    expect(await statusOf(accept(token))).toBe(410)

    await restoreInvitation(db, id, adminOf())
    // Same token, so the link already in the invitee's inbox starts working again.
    await expect(findLiveInvitationByEmail(EMAILS.invitee)).resolves.toMatchObject({ token })
  })

  it('takes back the invitee’s queued push, so a withdrawn invitation never buzzes', async () => {
    const { id } = await invite()
    await resendInvitation(
      db,
      { invitationFk: id, inviter: 'ada', inviterFk: users.admin.userId, userRegions: adminOf() },
      MAIL,
    )
    expect(await queued()).toHaveLength(1)

    await revokeInvitation(db, id, adminOf())

    // Otherwise the push goes out minutes later asking somebody to accept a token that is already
    // dead, and the tap lands on a settings screen with no invitation on it.
    expect(await queued()).toEqual([])
  })

  it('refuses somebody who does not administer the region', async () => {
    const { id } = await invite()

    expect(await statusOf(revokeInvitation(db, id, []))).toBe(403)
    expect(await statusOf(restoreInvitation(db, id, adminOf(regionId + 1000)))).toBe(403)
  })

  it('refuses an invitation that is not there', async () => {
    expect(await statusOf(revokeInvitation(db, -1, adminOf()))).toBe(404)
  })
})

describe.skipIf(!reachable)('resendInvitation', () => {
  it('mails the accept link for the same token and records the send', async () => {
    const { id, token } = await invite()

    await expect(
      resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL),
    ).resolves.toEqual({ email: EMAILS.invitee, sent: true })

    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].to).toBe(EMAILS.invitee)
    // The one assertion the browser spec cannot make, because that mail goes to a real inbox.
    expect(mail.sent[0].action?.url).toBe(`${MAIL.origin}/invite/accept?token=${token}`)
    // Varying, or Resend swallows the second send of a deliberate resend as a duplicate.
    expect(mail.sent[0].idempotencyKey).toMatch(new RegExp(`^invitation-${id}-\\d+$`))

    const [row] = await sql<{ lastSentAt: Date | null }[]>`
      select last_sent_at as "lastSentAt" from public.region_invitations where id = ${id}`
    expect(row.lastSentAt).not.toBeNull()
  })

  it('refreshes the expiry, so a resend buys the invitee the full window again', async () => {
    const { id } = await invite()
    await sql`update public.region_invitations set expires_at = now() + interval '1 hour' where id = ${id}`

    await resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL)

    const [row] = await sql<{ expiresAt: Date }[]>`
      select expires_at as "expiresAt" from public.region_invitations where id = ${id}`
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000)
  })

  it('records the send even when the mail did not go out, so a failing provider cannot be looped', async () => {
    const { id } = await invite()
    mail.result = false

    await expect(
      resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL),
    ).resolves.toMatchObject({ sent: false })

    // The throttle is now armed, which is exactly the case a retry loop would exploit.
    expect(
      await statusOf(resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL)),
    ).toBe(429)
    expect(mail.sent).toHaveLength(1)
  })

  it('refuses a second send inside the throttle window, before sending anything', async () => {
    const { id } = await invite()
    await resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL)

    expect(
      await statusOf(resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL)),
    ).toBe(429)
    expect(mail.sent).toHaveLength(1)
  })

  it('refuses somebody who does not administer the region, without mailing', async () => {
    const { id } = await invite()

    expect(await statusOf(resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: [] }, MAIL))).toBe(403)
    expect(mail.sent).toHaveLength(0)
  })

  /** The invitation cards the region has logged, oldest first. */
  const logged = () => sql<{ createdAt: Date; userFk: number }[]>`
    select created_at as "createdAt", actor_fk as "userFk" from public.events
    where region_fk = ${regionId} and verb = 'invite'
    order by id`

  it('logs the invitation when the first send never did, under whoever resent it', async () => {
    const { id } = await invite()

    await resendInvitation(
      db,
      { invitationFk: id, inviter: 'ada', inviterFk: users.member.userId, userRegions: adminOf() },
      MAIL,
    )

    // `createInvitation` logs nothing; the card is written by whichever send reaches somebody.
    // That is this one, so it is this person's card, not the original inviter's.
    expect(await logged()).toEqual([{ createdAt: expect.any(Date), userFk: users.member.userId }])
  })

  it('says nothing when the invitation is already on the record, and leaves its date alone', async () => {
    const { id } = await invite()
    await sql`
      insert into public.events (verb, subject_fk, metadata, region_fk, actor_fk, created_at)
      values ('invite', ${users.admin.userId}, ${EMAILS.invitee}, ${regionId},
              ${users.admin.userId}, now() - interval '7 days')`
    const [before] = await logged()

    await resendInvitation(
      db,
      { invitationFk: id, inviter: 'ada', inviterFk: users.member.userId, userRegions: adminOf() },
      MAIL,
    )

    // A resend is not a new invitation. Writing one anyway collapsed onto this row and re-dated
    // it to now, floating a week-old card back to the top of the feed in somebody else's name.
    expect(await logged()).toEqual([before])
  })

  it('writes to the recipient’s stored language, not the sender’s', async () => {
    await sql`update public.user_settings set contact_locale = 'de' where user_fk = ${users.invitee.userId}`
    const { id } = await invite()

    await resendInvitation(db, { invitationFk: id, inviter: 'ada', userRegions: adminOf() }, MAIL)

    expect(mail.sent[0].locale).toBe('de')
    expect(mail.sent[0].subject).toContain('eingeladen')
  })

  it('buzzes an invitee who already has an account, beside the mail and not instead of it', async () => {
    const { id } = await invite()

    await resendInvitation(
      db,
      { invitationFk: id, inviter: 'ada', inviterFk: users.admin.userId, userRegions: adminOf() },
      MAIL,
    )

    expect(await queued()).toEqual([{ userFk: users.invitee.userId }])
    // The invitation mail is still the channel, and still the only one that carries the token.
    expect(mail.sent).toHaveLength(1)
  })

  it('buzzes once when a different admin resends, not once per admin', async () => {
    const { id } = await invite()

    for (const inviterFk of [users.admin.userId, users.member.userId]) {
      await sql`update public.region_invitations set last_sent_at = null where id = ${id}`
      await resendInvitation(db, { invitationFk: id, inviter: 'ada', inviterFk, userRegions: adminOf() }, MAIL)
    }

    // `actor_fk` is in the unique key, so a second admin's row does not collide with the first's.
    // Without the retract before the insert this is two rows, and two pushes for one invitation.
    expect(await queued()).toEqual([{ userFk: users.invitee.userId }])
  })

  it('queues nothing for an address with no account, which is most invitations', async () => {
    const { id } = await invite('nobody@example.test')

    await resendInvitation(
      db,
      { invitationFk: id, inviter: 'ada', inviterFk: users.admin.userId, userRegions: adminOf() },
      MAIL,
    )

    expect(await queued()).toEqual([])
    expect(mail.sent).toHaveLength(1)
  })
})

describe('assertResendAllowed', () => {
  const now = Date.now()

  it('refuses a second send inside the throttle window', () => {
    expect(() => assertResendAllowed(new Date(now - 1000), now)).toThrowError(expect.objectContaining({ status: 429 }))
  })

  it('allows the first send and one past the window', () => {
    expect(() => assertResendAllowed(null, now)).not.toThrow()
    expect(() => assertResendAllowed(new Date(now - RESEND_THROTTLE_MS - 1), now)).not.toThrow()
  })
})

describe.skipIf(!reachable)('resolveContactLocale', () => {
  it('prefers the recipient account’s stored language over the sender’s', async () => {
    await sql`update public.user_settings set contact_locale = 'de' where user_fk = ${users.invitee.userId}`

    expect(await resolveContactLocale(EMAILS.invitee, 'en')).toBe('de')
  })

  it('falls back to the sender’s locale, then to the base one', async () => {
    // No account on that address at all, which is the common case for an invitee.
    expect(await resolveContactLocale('nobody@grnyte.rocks', 'de')).toBe('de')
    expect(await resolveContactLocale('nobody@grnyte.rocks', undefined)).toBe('en')
    expect(await resolveContactLocale('nobody@grnyte.rocks', 'kl')).toBe('en')
  })
})

describe('inviteEmailContent', () => {
  const url = 'http://localhost:3000/invite/accept?token=7f1d0f0e-0000-4000-8000-000000000001'
  const content = (locale: 'de' | 'en') =>
    inviteEmailContent({ inviter: 'ada', locale, regionName: 'Fontainebleau', url })

  it('carries the accept URL, the region and the inviter', () => {
    const mail = content('en')

    expect(mail.action?.url).toBe(url)
    expect(mail.subject).toContain('ada')
    expect(mail.subject).toContain('Fontainebleau')
    expect(mail.action?.label).toContain('Fontainebleau')
    expect(mail.footerReason).toBe('invite')
  })

  it('renders in the recipient’s language', () => {
    expect(content('de').subject).not.toBe(content('en').subject)
    expect(content('de').subject).toContain('eingeladen')
  })
})
