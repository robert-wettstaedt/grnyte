import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// `blocks.grade_counts` is kept by a trigger on `routes`, for every writer: a read-only member may update a
// route (its community grade moves when they log an ascent) but may not update the block.
let owner: SeedUser
let reader: SeedUser
let regionId = 0
let blockA = 0
let blockB = 0
let low = 0
let high = 0

const countsOf = async (id: number) =>
  (await sql<{ grade_counts: Record<string, number> }[]>`select grade_counts from public.blocks where id = ${id}`)[0]
    .grade_counts

/** Runs `query` as `who` under RLS, the way the app's connection does, and commits. */
async function as(who: SeedUser, query: (tx: typeof sql) => Promise<unknown>) {
  const claims = JSON.stringify({ email: who.email, role: 'authenticated', sub: who.authId })
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`
    await tx.unsafe('set local role app_writer')
    await query(tx as unknown as typeof sql)
  })
}

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion('__grade_counts_region__')
  owner = seeded.user
  regionId = seeded.regionId
  reader = await createThrowawayUser('grade_counts_reader')
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${reader.userId}, ${reader.authId}, 'region_user', true)`
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk) values ('Wand', ${regionId}) returning id`
  const blocks = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, "order")
    values ('Pilz', ${area.id}, ${regionId}, 0), ('Turm', ${area.id}, ${regionId}, 1) returning id`
  ;[blockA, blockB] = blocks.map((b) => b.id)
  ;[low, high] = (await sql<{ id: number }[]>`select id from public.grades order by id limit 2`).map((g) => g.id)
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  await dropThrowawayUser(reader)
  void owner
})

describe.skipIf(!reachable)('blocks.grade_counts', () => {
  it('follows every route write, including a read-only member regrading a route', async () => {
    expect(await countsOf(blockA)).toEqual({})

    const [{ id: graded }] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, user_grade_fk)
      values ('Kante', ${blockA}, ${regionId}, ${low}) returning id`
    const [{ id: ungraded }] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk) values ('Riss', ${blockA}, ${regionId}) returning id`
    expect(await countsOf(blockA)).toEqual({ [low]: 1, none: 1 })

    await as(reader, (tx) => tx`update public.routes set user_grade_fk = ${high} where id = ${graded}`)
    expect(await countsOf(blockA)).toEqual({ [high]: 1, none: 1 })

    await sql`update public.routes set block_fk = ${blockB} where id = ${graded}`
    expect([await countsOf(blockA), await countsOf(blockB)]).toEqual([{ none: 1 }, { [high]: 1 }])

    await sql`update public.routes set deleted_at = now() where id = ${ungraded}`
    expect(await countsOf(blockA)).toEqual({})
    await sql`update public.routes set deleted_at = null where id = ${ungraded}`
    expect(await countsOf(blockA)).toEqual({ none: 1 })

    await sql`delete from public.routes where id in (${graded}, ${ungraded})`
    expect([await countsOf(blockA), await countsOf(blockB)]).toEqual([{}, {}])
  })

  it('recounts blocks a write with triggers off left behind', async () => {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`insert into public.routes (name, block_fk, region_fk, user_grade_fk)
               values ('Platte', ${blockA}, ${regionId}, ${low}), ('Dach', ${blockA}, ${regionId}, ${low})`
    })
    expect(await countsOf(blockA)).toEqual({})

    await sql`select public.recount_block_grade_counts(${[blockA]}::int[])`
    expect(await countsOf(blockA)).toEqual({ [low]: 2 })
  })
})
