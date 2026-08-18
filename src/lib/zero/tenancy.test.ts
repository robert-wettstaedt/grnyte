// @vitest-environment node
/**
 * End-to-end tests for the tenancy boundary the sync layer enforces.
 *
 * `/api/zero/get-queries` is where a client's data access is decided: it builds a context from
 * the signed-in user's memberships and hands each query definition to zero-cache, which then runs
 * it against the replica with no row-level security of its own. The query definition *is* the
 * boundary, so testing it means running it the same way zero-cache does - real definitions, real
 * context (`getUserPermissions`, exactly as the endpoint builds it), real database, real rows.
 * `zeroPostgresJS` is the executor Zero ships for that.
 *
 * This is the counterpart to `regionPolicies.test.ts`: that file covers the RLS that guards the
 * remote functions, this one covers the sync path, which RLS never sees. The connection, the
 * reachability probe and the seed-user lookup are shared with it via `$lib/db/testDb`.
 *
 * Fixtures are two regions with one member each, so "a region you do not belong to" is a real
 * region with real content rather than an id that happens not to exist. `anon@` is the useful
 * user here: no memberships of their own, so after joining fixture B everything they can see is
 * something this file put there, and "sees nothing else" is an exact assertion.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { queries } from '$lib/zero/queries'
import { schema } from '$lib/zero/zero-schema'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authenticatedUserCan, regionMemberCan, regionTables, type QueryContext } from './permissions'
import { zql } from './zero-schema.gen'

const REGION_A = '__tenancy_a__'
const REGION_B = '__tenancy_b__'
const AREA_A = '__tenancy_area_a__'
const AREA_B = '__tenancy_area_b__'

/** No auth user has this id, so `getUserPermissions` resolves it to no regions at all. */
const NOBODY = '00000000-0000-0000-0000-000000000000'

const EMAILS = {
  /** Member of fixture region A (and of their own real regions). */
  insider: 'user@grnyte.rocks',
  /** No memberships except fixture region B, which makes their view exactly assertable. */
  outsider: 'anon@grnyte.rocks',
} as const

type Who = keyof typeof EMAILS

// Cast because zero ships its own copy of `postgres` and the two Sql types are structurally
// distinct. Sharing one client rather than handing the adapter a connection string keeps the
// fixtures and the queries on the same pool, which afterAll can then actually close.
const zero = zeroPostgresJS(schema, sql as unknown as Parameters<typeof zeroPostgresJS>[1])

let users = {} as Record<Who, SeedUser>
let regionA = 0
let regionB = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design
type AnyQueryDef = { fn: (options: any) => any }

/** The context `/api/zero/get-queries` would build for `who`, rebuilt on every call so a
 *  membership change between assertions is actually reflected. */
async function ctxFor(who: typeof NOBODY | Who): Promise<QueryContext> {
  const authUserId = who === NOBODY ? NOBODY : users[who].authId
  return { authUserId, pageState: await getUserPermissions(db, authUserId) }
}

/**
 * An unrestricted query over `table`, wrapped the way every entity module wraps its own:
 * `regionMemberCan` around a `zql` table. Sweeping this covers the mechanism all region queries
 * share, rather than whichever individual query happens to be convenient to call - and it stays
 * meaningful as entity queries come and go.
 */
function regionScopedQuery(table: (typeof regionTables)[number]): AnyQueryDef {
  return { fn: regionMemberCan<undefined, undefined>(() => zql[table]) }
}

/** Runs a query definition the way zero-cache does: transform it for `ctx`, then execute it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto; every caller asserts the shape it wants
async function run<T = any>(query: AnyQueryDef, args: unknown, ctx: QueryContext): Promise<T> {
  return (await zero.run(query.fn({ args, ctx }))) as T
}

/** Every region id present in `rows`, for "did anything from another tenant come back". */
const regionsIn = (rows: { regionFk?: null | number }[]) =>
  [...new Set(rows.map((row) => row.regionFk).filter((regionFk) => regionFk != null))].sort()

async function removeFixtures() {
  const names = [REGION_A, REGION_B]
  await sql`delete from public.reactions where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.events where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.areas where name = any(${[AREA_A, AREA_B]})`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.regions where name = any(${names})`
}

beforeAll(async () => {
  if (!reachable) return

  users = await seedUsers(EMAILS)

  await removeFixtures()
  ;[{ id: regionA }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION_A}, ${users.insider.userId}, 10)
    returning id`
  ;[{ id: regionB }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION_B}, ${users.outsider.userId}, 10)
    returning id`

  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk) values
      (${regionA}, 'region_admin', true, ${users.insider.authId}, ${users.insider.userId}),
      (${regionB}, 'region_admin', true, ${users.outsider.authId}, ${users.outsider.userId})`

  await sql`
    insert into public.areas (name, region_fk, created_by) values
      (${AREA_A}, ${regionA}, ${users.insider.userId}),
      (${AREA_B}, ${regionB}, ${users.outsider.userId})`
}, 30_000)

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('region content never crosses the tenancy boundary', () => {
  it('syncs a region member only the content of the regions they belong to', async () => {
    const areas = await run<{ name: string; regionFk: number }[]>(
      regionScopedQuery('areas'),
      undefined,
      await ctxFor('outsider'),
    )

    // The outsider belongs to fixture B only, so this is exhaustive rather than a spot check:
    // one area, the one this file put in their region.
    expect(areas.map((area) => area.name)).toEqual([AREA_B])
    expect(regionsIn(areas)).toEqual([regionB])
  })

  it.each([...regionTables])('never leaks a foreign region through a query over %s', async (table) => {
    const rows = await run<{ regionFk?: null | number }[]>(
      regionScopedQuery(table),
      undefined,
      await ctxFor('outsider'),
    )

    // Most fixture tables are empty, which is itself the assertion: a region-scoped table must
    // return nothing at all for a region the user is not in.
    expect(regionsIn(rows)).not.toContain(regionA)
    expect(regionsIn(rows).filter((regionFk) => regionFk !== regionB)).toEqual([])
  })

  /**
   * The sweep above wraps a bare table, so nothing in it nests a `related()`. A nested relation is
   * filtered by a second mechanism (`relatedRegion` inside the query definition), and a relation
   * added without it would sync rows from a region the reader is not in while the top-level row is
   * perfectly legitimate.
   *
   * Asserted on the one relation where the mismatch is reachable at all: a reaction carries its
   * own `region_fk`, and while RLS refuses to write one that disagrees with its event, the sync
   * path never sees RLS. Written here over the superuser connection, exactly as a bug or a bad
   * backfill would produce it.
   */
  it('filters a nested relation by region too, not only the row it hangs off', async () => {
    const [{ id: eventId }] = await sql<{ id: number }[]>`
      insert into public.events (verb, actor_fk, region_fk, subject_fk)
      values ('join', ${users.insider.userId}, ${regionA}, ${users.insider.userId})
      returning id`

    await sql`
      insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk) values
        (${eventId}, '👍', 'emoji', ${regionA}, ${users.insider.authId}, ${users.insider.userId}),
        (${eventId}, '🔥', 'emoji', ${regionB}, ${users.outsider.authId}, ${users.outsider.userId})`

    const rows = await run<{ id: number; reactions: { regionFk: number }[] }[]>(
      queries.listEvents,
      { ids: [eventId] },
      await ctxFor('insider'),
    )

    expect(rows).toHaveLength(1)
    expect(regionsIn(rows[0].reactions)).toEqual([regionA])
  })

  it('hides a region record from everyone who is not a member of it', async () => {
    const ctx = await ctxFor('insider')

    await expect(run(queries.region, { id: regionA }, ctx)).resolves.toMatchObject({ name: REGION_A })
    await expect(run(queries.region, { id: regionB }, ctx)).resolves.toBeUndefined()
  })

  it('hides a region member list from everyone who is not a member of it', async () => {
    const ctx = await ctxFor('insider')

    await expect(run(queries.listRegionMembers, { regionFk: regionA }, ctx)).resolves.toHaveLength(1)
    await expect(run(queries.listRegionMembers, { regionFk: regionB }, ctx)).resolves.toEqual([])
  })

  it('lists only your own memberships, never anybody else’s', async () => {
    const rows = await run<{ regionFk: number }[]>(queries.listUserRegions, undefined, await ctxFor('outsider'))

    expect(rows.map((row) => row.regionFk)).toEqual([regionB])
  })
})

describe.skipIf(!reachable)('membership is what grants access, moment to moment', () => {
  it('stops syncing a region as soon as the membership is gone', async () => {
    const before = await ctxFor('insider')
    await expect(run(queries.region, { id: regionA }, before)).resolves.toMatchObject({ name: REGION_A })

    await sql`delete from public.region_members where region_fk = ${regionA} and user_fk = ${users.insider.userId}`

    try {
      // Rebuilt from the database, the way the endpoint rebuilds it per request - so this is
      // the real question: does the next sync still hand over the region?
      const after = await ctxFor('insider')

      await expect(run(queries.region, { id: regionA }, after)).resolves.toBeUndefined()
      await expect(run(queries.listRegionMembers, { regionFk: regionA }, after)).resolves.toEqual([])

      const areas = await run<{ name: string }[]>(regionScopedQuery('areas'), undefined, after)
      expect(areas.map((area) => area.name)).not.toContain(AREA_A)
    } finally {
      await sql`
        insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk)
        values (${regionA}, 'region_admin', true, ${users.insider.authId}, ${users.insider.userId})`
    }
  })

  it('stops syncing a region as soon as the membership is deactivated', async () => {
    // `is_active` is NOT NULL, so `getUserPermissions` filtering it with `isNotNull` matched every
    // row and a deactivated member kept the whole region. Silently, too: the Zero region queries do
    // check `isActive`, so the region vanished from their settings while their device went on
    // syncing every area, route and ascent in it.
    await sql`update public.region_members set is_active = false where region_fk = ${regionA} and user_fk = ${users.insider.userId}`

    try {
      const ctx = await ctxFor('insider')

      expect(ctx.pageState?.userRegions?.map((region) => region.regionFk)).not.toContain(regionA)

      const areas = await run<{ name: string }[]>(regionScopedQuery('areas'), undefined, ctx)
      expect(areas.map((area) => area.name)).not.toContain(AREA_A)

      // The permissions that ride along with a membership have to go with it, or a deactivated
      // member still passes every `checkRegionPermission` the remote functions make.
      expect(ctx.pageState?.userRegions?.find((region) => region.regionFk === regionA)).toBeUndefined()
    } finally {
      await sql`update public.region_members set is_active = true where region_fk = ${regionA} and user_fk = ${users.insider.userId}`
    }
  })

  it('syncs nothing at all to a user with no memberships', async () => {
    // The empty-membership case is the one that has to fail closed: an unfiltered query here
    // would hand a brand new account every region in the database.
    const ctx = await ctxFor(NOBODY)

    await expect(run(regionScopedQuery('areas'), undefined, ctx)).resolves.toEqual([])
    await expect(run(queries.listUserRegions, undefined, ctx)).resolves.toEqual([])
    await expect(run(queries.listRegionMembers, { regionFk: regionA }, ctx)).resolves.toEqual([])
    await expect(run(queries.region, { id: regionA }, ctx)).resolves.toBeUndefined()
  })
})

describe.skipIf(!reachable)('the context the sync endpoint serves from', () => {
  // `regionMemberCan` only filters when the context carries memberships - without them it returns
  // the query untouched, which is correct for the client (its local replica is already filtered)
  // and would be a hole on the server. `/api/zero/get-queries` refuses to serve such a context;
  // this is the invariant that refusal relies on never actually firing.
  it.each([
    ['a user with regions', 'insider'],
    ['a user with none', NOBODY],
  ] as const)('resolves memberships to a list for %s', async (_label, who) => {
    const ctx = await ctxFor(who)

    expect(Array.isArray(ctx.pageState?.userRegions)).toBe(true)
  })

  it('refuses a query with no context at all', () => {
    const query = authenticatedUserCan<undefined, undefined>(() => zql.regions)
    expect(() => query({ args: undefined, ctx: null as never })).toThrow('Not allowed')
  })
})

// No database needed: this one reads the generated schema, so it runs on every `npm test`.
describe('the region-scoped table list', () => {
  it('names every table the schema gives a region', () => {
    // `regionTables` is what decides which queries get filtered, and until now the only thing
    // keeping it complete was a comment. A migration that adds a `region_fk` to a new table
    // regenerates the Zero schema and fails here, rather than shipping the table unfiltered.
    //
    // `activities` is the one deliberate omission: the events tables replaced it and no query may
    // name it any more. It is still in the drizzle schema, so drizzle-zero still emits it, and it
    // leaves here when the table is dropped.
    const RETIRED = ['activities']

    const withRegionFk = Object.entries(schema.tables)
      .filter(([, table]) => 'regionFk' in table.columns)
      .map(([name]) => name)
      .filter((name) => !RETIRED.includes(name))

    expect([...regionTables].sort()).toEqual(withRegionFk.sort())
  })
})
