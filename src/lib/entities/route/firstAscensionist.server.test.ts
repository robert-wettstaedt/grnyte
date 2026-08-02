// @vitest-environment node
/**
 * Regression test for the self-claim rule in `resolveFirstAscensionists`. A first-ascensionist row
 * bound to a user account surfaces on that account's profile and stats, so only that user may create
 * the binding (mirrors v1). Before the fix, `faClimberSchema` took `userFk` straight from the client
 * and it was written verbatim, so an editor could attribute a route's first ascent to any real user.
 *
 * Superuser connection (RLS bypassed) - `callerUserFk` is the identity the mutation trusts, passed in
 * directly. Skipped when DATABASE_URL is unreachable so `npm test` still passes without a database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveFirstAscensionists } from './firstAscensionist.server'

const REGION = '__fa_selfclaim_region__'

const EMAILS = {
  caller: 'user@grnyte.rocks',
  stranger: 'maintainer@grnyte.rocks',
} as const

let users = {} as Record<keyof typeof EMAILS, SeedUser>
let regionId = 0

/** The region's climber rows, so a test can assert what `userFk` was actually stored. */
async function climbersInRegion() {
  return sql<{ name: string; userFk: null | number }[]>`
    select name, user_fk as "userFk" from public.first_ascensionists where region_fk = ${regionId} order by name`
}

async function removeFixtures() {
  const inRegion = sql`(select id from public.regions where name = ${REGION})`
  // A self-claim logs an activity, which references the region: it has to go first.
  await sql`delete from public.activities where region_fk in ${inRegion}`
  await sql`delete from public.first_ascensionists where region_fk in ${inRegion}`
  await sql`delete from public.regions where name = ${REGION}`
}

beforeAll(async () => {
  if (!reachable) return
  users = await seedUsers(EMAILS)
  await removeFixtures()
  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${users.caller.userId}, 10) returning id`
}, 30_000)

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('resolveFirstAscensionists self-claim', () => {
  it('drops a userFk that is not the caller: the created climber is name-only', async () => {
    await resolveFirstAscensionists(
      db,
      [{ name: 'Ghost', userFk: users.stranger.userId }],
      regionId,
      users.caller.userId,
    )
    const [row] = (await climbersInRegion()).filter((c) => c.name === 'Ghost')
    expect(row.userFk).toBeNull()
  })

  it('keeps the caller’s own userFk: a user can claim themselves', async () => {
    await resolveFirstAscensionists(db, [{ name: 'Me', userFk: users.caller.userId }], regionId, users.caller.userId)
    const [row] = (await climbersInRegion()).filter((c) => c.name === 'Me')
    expect(row.userFk).toBe(users.caller.userId)
  })

  it('reuses an existing user-linked climber by name, preserving the link on edit', async () => {
    // A climber the stranger legitimately claimed earlier.
    await sql`
      insert into public.first_ascensionists (name, region_fk, user_fk)
      values ('Alice', ${regionId}, ${users.stranger.userId})`

    // An editor (the caller) re-submits "alice" while editing a route - matches by name, no new row,
    // the existing link is untouched. The stray userFk they send is irrelevant.
    const resolved = await resolveFirstAscensionists(
      db,
      [{ name: 'alice', userFk: users.caller.userId }],
      regionId,
      users.caller.userId,
    )

    const alices = (await climbersInRegion()).filter((c) => c.name === 'Alice')
    expect(alices).toHaveLength(1)
    expect(alices[0].userFk).toBe(users.stranger.userId)
    expect(resolved).toHaveLength(1)
  })
})
