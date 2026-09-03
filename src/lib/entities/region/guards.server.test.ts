// @vitest-environment node
/**
 * The app-level half of region administration: the guardrails that keep a region administrable
 * and its membership consensual.
 *
 * `regionPolicies.test.ts` covers what the database refuses; this covers what the mutations refuse
 * before the database is even asked. Both halves matter, because RLS happily lets a region admin
 * demote the last admin or add anybody they like - "do not orphan the region" and "an undo is not
 * an insert" are app rules, not policies.
 *
 * Real database, real fixtures: every guard here is a query, so a mock would test nothing. The
 * connection is the superuser one (RLS bypassed) because these functions run inside an already
 * RLS-scoped transaction in production: the question here is the rule, not the policy.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { activeAdminUserFks, assertMemberChangeAllowed, findActiveMember, resolveRestore } from './guards.server'

const REGION = '__guards_region__'
const OTHER_REGION = '__guards_other__'

const EMAILS = {
  /** Sole admin of the fixture region in the default fixture state. */
  admin: 'maintainer@grnyte.rocks',
  member: 'user@grnyte.rocks',
  /** Never a member of the fixture region: the "add anybody" target. */
  outsider: 'anon@grnyte.rocks',
  /** A plain member, and the second admin when a test promotes them. */
  second: 'admin@grnyte.rocks',
} as const

type Who = keyof typeof EMAILS

let users = {} as Record<Who, SeedUser>
let regionId = 0
let otherRegionId = 0

/**
 * The event `removeRegionMember` writes, which is what `resolveRestore` demands as proof.
 *
 * No `metadata`, which is the discriminator: a revoked invitation writes the same verb about the
 * same subject with the address in it, and must not read as a removal to restore.
 */
const logRemoval = (regionFk: number, userFk: number, metadata: null | string = null) => sql`
  insert into public.events (verb, subject_fk, region_fk, actor_fk, metadata)
  values ('remove', ${userFk}, ${regionFk}, ${users.admin.userId}, ${metadata})`

async function removeFixtures() {
  const names = [REGION, OTHER_REGION]
  await sql`delete from public.events where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.regions where name = any(${names})`
}

/** admin@ is the sole region_admin, member@ is a plain member, second@ is a maintainer. */
async function seedMembers() {
  await sql`delete from public.events where region_fk in (${regionId}, ${otherRegionId})`
  await sql`delete from public.region_members where region_fk in (${regionId}, ${otherRegionId})`
  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk) values
      (${regionId}, 'region_admin', true, ${users.admin.authId}, ${users.admin.userId}),
      (${regionId}, 'region_user', true, ${users.member.authId}, ${users.member.userId}),
      (${regionId}, 'region_maintainer', true, ${users.second.authId}, ${users.second.userId}),
      (${otherRegionId}, 'region_admin', true, ${users.outsider.authId}, ${users.outsider.userId})`
}

beforeAll(async () => {
  if (!reachable) return

  users = await seedUsers(EMAILS)

  await removeFixtures()
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${users.admin.userId}, 10) returning id`
  ;[{ id: otherRegionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${OTHER_REGION}, ${users.outsider.userId}, 10) returning id`
}, 30_000)

beforeEach(async () => {
  if (reachable) await seedMembers()
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('activeAdminUserFks', () => {
  it('counts only admins, only active ones, and only in the region asked about', async () => {
    expect(await activeAdminUserFks(db, regionId)).toEqual([users.admin.userId])

    // A deactivated admin is not an admin: counting them would let the last real one leave.
    await sql`update public.region_members set is_active = false where region_fk = ${regionId} and user_fk = ${users.admin.userId}`
    expect(await activeAdminUserFks(db, regionId)).toEqual([])
  })
})

describe.skipIf(!reachable)('assertMemberChangeAllowed', () => {
  const change = (actor: Who, target: Who, nextRole: null | string) =>
    assertMemberChangeAllowed(db, users[actor].userId, {
      nextRole,
      regionFk: regionId,
      userFk: users[target].userId,
    })

  it('refuses to demote the last admin', async () => {
    await expect(change('second', 'admin', 'region_user')).rejects.toMatchObject({ status: 409 })
  })

  it('refuses to remove the last admin', async () => {
    // Same rule, and the one that matters more: removal is the path with an Undo behind it.
    await expect(change('second', 'admin', null)).rejects.toMatchObject({ status: 409 })
  })

  it('lets one of two admins be demoted or removed', async () => {
    await sql`update public.region_members set role = 'region_admin' where region_fk = ${regionId} and user_fk = ${users.second.userId}`

    await expect(change('second', 'admin', 'region_user')).resolves.toBeUndefined()
    await expect(change('second', 'admin', null)).resolves.toBeUndefined()
  })

  it('always allows a promotion to admin, even of the last admin', async () => {
    // Nothing is lost by adding an admin, so the last-admin rule must not block a no-op re-set.
    await expect(change('second', 'admin', 'region_admin')).resolves.toBeUndefined()
  })

  it('refuses to change your own role, however senior you are', async () => {
    // An accidental self-demotion locks you out of the screen you did it on. This one is checked
    // before the last-admin rule, so it holds even when the region has admins to spare.
    await sql`update public.region_members set role = 'region_admin' where region_fk = ${regionId} and user_fk = ${users.second.userId}`

    await expect(change('admin', 'admin', 'region_user')).rejects.toThrow()
    await expect(change('admin', 'admin', 'region_admin')).rejects.toThrow()
    await expect(change('member', 'member', null)).rejects.toThrow()
  })

  it('lets a plain member be changed or removed freely', async () => {
    await expect(change('admin', 'member', 'region_maintainer')).resolves.toBeUndefined()
    await expect(change('admin', 'member', null)).resolves.toBeUndefined()
  })
})

describe.skipIf(!reachable)('findActiveMember', () => {
  it('finds an active member of the region', async () => {
    await expect(findActiveMember(db, regionId, users.member.userId)).resolves.toMatchObject({ role: 'region_user' })
  })

  it('refuses a deactivated membership rather than treating it as live', async () => {
    await sql`update public.region_members set is_active = false where region_fk = ${regionId} and user_fk = ${users.member.userId}`
    await expect(findActiveMember(db, regionId, users.member.userId)).rejects.toThrow()
  })

  it('refuses a membership of a different region', async () => {
    await expect(findActiveMember(db, regionId, users.outsider.userId)).rejects.toThrow()
  })
})

describe.skipIf(!reachable)('resolveRestore', () => {
  it('refuses to restore somebody who was never removed', async () => {
    // The whole point: without proof of a removal this is an admin-only "add any user to my
    // region" primitive, skipping the invitation flow and the seat limit entirely.
    await expect(resolveRestore(db, regionId, users.outsider.userId)).rejects.toThrow()
  })

  it('refuses a removal logged against a different region', async () => {
    await logRemoval(otherRegionId, users.outsider.userId)
    await expect(resolveRestore(db, regionId, users.outsider.userId)).rejects.toThrow()
  })

  it('refuses a revoked invitation wearing the same verb, which is what metadata is for', async () => {
    await logRemoval(regionId, users.outsider.userId, 'outsider@grnyte.rocks')

    await expect(resolveRestore(db, regionId, users.outsider.userId)).rejects.toThrow()
  })

  it('allows the restore once the removal is on record, and derives auth_user_fk itself', async () => {
    await sql`delete from public.region_members where region_fk = ${regionId} and user_fk = ${users.member.userId}`
    await logRemoval(regionId, users.member.userId)

    await expect(resolveRestore(db, regionId, users.member.userId)).resolves.toEqual({
      alreadyMember: false,
      // Derived from `users`, never from the snapshot: this is what grants the region, so a
      // snapshot-supplied value would hand it to whichever account the caller named.
      authUserFk: users.member.authId,
    })
  })

  it('reports an existing membership so a double undo cannot duplicate it', async () => {
    // Stands in for the unique constraint on (region_fk, user_fk) that was deliberately not added.
    await logRemoval(regionId, users.member.userId)

    await expect(resolveRestore(db, regionId, users.member.userId)).resolves.toMatchObject({ alreadyMember: true })
  })
})
