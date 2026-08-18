/**
 * `listRegionInvitations` and `userContributionCount` driven as real requests, in real RLS
 * transactions, by three callers with three different views of the same two regions.
 *
 * One file for two modules because they are one question asked twice: a handler that took a
 * `regionFk` from the client (or carried no region predicate at all) and left the scoping to a
 * policy. They also want the same fixture, two regions, three memberships, a pending invitation
 * and a handful of activity rows, and building that twice is how the two halves drift apart.
 *
 * A query is invoked by calling it, the way a component does; only a `form` needs `callForm`.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { userContributionCount } from '../activity/activities.remote'
import { listRegionInvitations } from './regions.remote'

const HOME = '__regions_remote_home__'
const OTHER = '__regions_remote_other__'
const INVITEE = '__regions_remote_invitee__@grnyte.test'

/** `region_admin` in BOTH regions. */
let admin: SeedUser
/** `region_user` in HOME only: a member, and not an admin. That is the interesting caller, because
 *  the policy standing in for the missing gate is a region.read one, so this account can read both
 *  the invitations and the HOME activity today. */
let member: SeedUser
/** A member of neither region. */
let outsider: SeedUser
/** Whose contributions are counted. A throwaway rather than a seed login for the reason `testDb`
 *  spells out: this asserts on a COUNT of rows one account owns, and other suites write activities
 *  as the seed users while this file runs. Nobody but this file ever writes activity for them. */
let contributor: SeedUser

let homeRegionId = 0
let otherRegionId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({
    admin: 'admin@grnyte.rocks',
    member: 'user@grnyte.rocks',
  })
  admin = users.admin
  member = users.member
  // A throwaway, not the shared `anon@` seed login. The zero-contribution assertion below is about
  // the empty-region-list branch, and nothing guarantees a shared account holds no memberships: on a
  // database where it holds one the branch is never taken, the query runs, and the test still
  // returns 0 for an unrelated reason. A fresh account is what makes its comment true.
  outsider = await createThrowawayUser('no-regions')
  contributor = await createThrowawayUser('contributions')

  const [home] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${HOME}, ${admin.userId}) returning id`
  const [other] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${OTHER}, ${admin.userId}) returning id`
  homeRegionId = home.id
  otherRegionId = other.id

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${homeRegionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${otherRegionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${homeRegionId}, ${member.userId}, ${member.authId}, 'region_user', true)`

  await sql`
    insert into public.region_invitations (region_fk, email, invited_by, token, status, expires_at)
    values (
      ${homeRegionId}, ${INVITEE}, ${admin.userId}, gen_random_uuid(), 'pending', now() + interval '7 days')`

  // Two crag-data contributions in HOME, one in OTHER, and one ascent activity that is not a crag
  // edit at all. `entity_id` is text and points at nothing on purpose: the count reads `activities`
  // and joins nothing, so inventing rows to match would only make the fixture harder to clean up.
  await sql`
    insert into public.activities (region_fk, user_fk, entity_id, entity_type, type) values
      (${homeRegionId}, ${contributor.userId}, '1', 'route', 'created'),
      (${homeRegionId}, ${contributor.userId}, '2', 'area', 'updated'),
      (${homeRegionId}, ${contributor.userId}, '3', 'ascent', 'created'),
      (${otherRegionId}, ${contributor.userId}, '4', 'block', 'created')`
})

afterAll(async () => {
  if (reachable) {
    // `activities` and `region_invitations` first: both carry a region FK, so the region delete
    // raises 23503 otherwise. The throwaway user goes last, for the same reason.
    await sql`delete from public.activities where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.region_invitations where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.region_members where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.regions where id in (${homeRegionId}, ${otherRegionId})`
    await dropThrowawayUser(contributor)
    await dropThrowawayUser(outsider)
  }
  await sql.end()
})

/** The status of the HttpError a handler threw, or `undefined` when it returned normally. A refusal
 *  is an exception here, so the assertion has to be on the status rather than on a return value. */
async function statusOf(run: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await run()
    return undefined
  } catch (error) {
    return (error as { status?: number })?.status
  }
}

describe.skipIf(!reachable)('listRegionInvitations', () => {
  it("lists a region's pending invitations for an admin of that region", async () => {
    const rows = await asRequest(admin.authId, () => listRegionInvitations({ regionFk: homeRegionId }))

    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe(INVITEE)
  })

  it('serves a member of the region who is not an admin of it', async () => {
    // Deliberately NOT admin-only, and this is the case that pins it. The settings page runs this
    // query for every member because a pending invitation holds a seat: gate it at admin and an
    // ordinary member is shown a lower seat count than the admin next to them, and their page load
    // 403s. Only the rendered list is admin-only, not the read.
    const rows = await asRequest(member.authId, () => listRegionInvitations({ regionFk: homeRegionId }))

    expect(rows).toHaveLength(1)
  })

  it('refuses a caller who is in the region in no capacity at all', async () => {
    // RLS answered this one with an empty list rather than a refusal, which was correct and not
    // ours. Now the handler owns it, so it stays a refusal whatever the policies do next.
    const status = await statusOf(() =>
      asRequest(outsider.authId, () => listRegionInvitations({ regionFk: homeRegionId })),
    )

    expect(status).toBe(403)
  })
})

describe.skipIf(!reachable)('userContributionCount', () => {
  it('counts crag edits across every region the caller can read', async () => {
    // Three of the four fixture rows: two in HOME, one in OTHER. The fourth is an ascent, which is
    // not a crag data edit and never was counted.
    const total = await asRequest(admin.authId, () => userContributionCount(contributor.userId))

    expect(total).toBe(3)
  })

  it('leaves out the regions the caller cannot read', async () => {
    // Same subject, same rows, a caller who is only in HOME: the OTHER contribution is not theirs
    // to know about. This is the assertion that would read 3 if the region predicate ever went
    // missing again, whether by an edit here or by a policy that stops covering `activities`.
    const total = await asRequest(member.authId, () => userContributionCount(contributor.userId))

    expect(total).toBe(2)
  })

  it('is zero for a caller who belongs to no region', async () => {
    // The empty-list branch, which never reaches the database. Zero, not everything.
    const total = await asRequest(outsider.authId, () => userContributionCount(contributor.userId))

    expect(total).toBe(0)
  })
})
