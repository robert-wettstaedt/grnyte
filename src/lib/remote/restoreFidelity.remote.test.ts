/**
 * Delete it, undo it, and get the same row back.
 *
 * `restoreSnapshots.remote.test.ts` asks the security question: which columns the server derives
 * rather than taking from a snapshot that has been through the client. This file asks the other
 * one, which nothing else does: does a hard delete followed by Undo LOSE anything.
 *
 * It can lose things because an entity's field list is written out four times over - the snapshot
 * type, the delete that fills it, the zod schema that validates it coming back, and the insert that
 * replays it. Add a column to `areas` and touch none of them and undo silently drops it: the row
 * comes back without its description, nothing errors, and the person who wrote that text finds it
 * gone. TypeScript cannot help, because nothing in those four places says the new column is one
 * undo ought to carry.
 *
 * So the comparison here NEVER lists columns. It reads whatever the table currently has, drops the
 * few that a rebuild is supposed to change, and compares the rest. A column added tomorrow is
 * compared tomorrow, without anybody remembering to come back here.
 *
 * The whole round trip runs for real: `delete<Entity>` produces the snapshot (a fresh, childless
 * row is inside the grace window, so it takes the hard path) and `restore<Entity>` consumes it.
 * Hand-building the snapshot would test only half of it, and the delete side is one of the four
 * places a new column gets forgotten.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { deleteArea, restoreArea } from '$lib/entities/area/areas.remote'
import { deleteBlock, restoreBlock } from '$lib/entities/block/blocks.remote'
import { deleteRoute, restoreRoute } from '$lib/entities/route/routes.remote'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REGION = '__fidelity_region__'

/**
 * Columns a rebuild is MEANT to change, so comparing them would only assert the obvious.
 *
 * Every one is a deliberate decision documented at the handler: the row is new, so it has a new id
 * and a new `created_at`; `created_by` is stamped from the caller rather than the snapshot, so undo
 * cannot forge authorship; `type` is derived by `refreshAreaType` and forced to null; `deleted_at`
 * is what the restore clears. `geolocation_fk` points at a pin that is itself recreated, so the id
 * moves while the coordinates (asserted separately) do not.
 *
 * The four route columns are derived too, and the restore RECOMPUTES them rather than carrying
 * them: ancestry off `block_fk`, and the user grade and rating off what people have logged. Coming
 * back computed rather than copied is the correct behaviour, so comparing them would fail on a
 * fixture built by raw insert rather than on anything undo did wrong.
 *
 * Everything not on this list is expected to survive verbatim. Keep it short: an entry here is a
 * column undo is allowed to lose.
 */
const REBUILT = new Set([
  'area_fks',
  'area_ids',
  'created_at',
  'created_by',
  'deleted_at',
  'geolocation_fk',
  'id',
  'type',
  'user_grade_fk',
  'user_rating',
])

let maintainer: SeedUser
let regionId = 0
let parentAreaId = 0
let cragAreaId = 0
let blockId = 0

/** Every column of one row, keyed by column name, straight from the table rather than from a list
 *  of names this file would then have to maintain. */
async function rowByName(table: string, name: string): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select * from ${sql(`public.${table}`)} where name = ${name}`
  expect(rows, `expected exactly one ${table} named ${name}`).toHaveLength(1)
  return rows[0]
}

/** The comparable half of a row: what a rebuild must reproduce, with the columns it is allowed to
 *  change taken out. */
const comparable = (row: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row).filter(([column]) => !REBUILT.has(column)))

async function createRegion(): Promise<number> {
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION}, ${maintainer.userId}) returning id`

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${region.id}, ${maintainer.userId}, ${maintainer.authId}, 'region_admin', true)`

  return region.id
}

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer
  regionId = await createRegion()

  // `canAddArea` wants a parent that is untyped or an 'area'; `canAddBlock` wants a 'crag'.
  const [parent] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__fidelity_parent__', 'area', ${regionId}, ${maintainer.userId}) returning id`
  parentAreaId = parent.id

  const [crag] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__fidelity_crag__', 'crag', ${regionId}, ${maintainer.userId}) returning id`
  cragAreaId = crag.id

  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__fidelity_block_parent__', ${cragAreaId}, ${regionId}, ${maintainer.userId}, 0) returning id`
  blockId = block.id
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`update public.blocks set geolocation_fk = null where region_fk = ${regionId}`
    await sql`delete from public.geolocations where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('undo loses nothing', () => {
  it('brings an area back with every column it had', async () => {
    // Populated deliberately, including the nullable ones: a column left null on the way in cannot
    // show that undo dropped it.
    const [area] = await sql<{ id: number }[]>`
      insert into public.areas (name, description, region_fk, created_by, parent_fk, walking_paths, geo_paths)
      values ('__fidelity_area__', '__fidelity_notes__', ${regionId}, ${maintainer.userId},
              ${parentAreaId}, ${sql.array(['__walk__'])}, ${sql.json(['__geo__'])})
      returning id`

    await sql`
      insert into public.geolocations (area_fk, region_fk, lat, long)
      values (${area.id}, ${regionId}, 47.1, 8.2)`

    const before = await rowByName('areas', '__fidelity_area__')

    const deleted = await asRequest(maintainer.authId, () => deleteArea({ id: area.id }))
    expect(deleted?.data?.mode, 'a fresh childless area should hard delete').toBe('hard')

    await asRequest(maintainer.authId, () => restoreArea(deleted!.data!))

    const after = await rowByName('areas', '__fidelity_area__')
    expect(comparable(after)).toEqual(comparable(before))

    // The parking rides along on the same snapshot, and is the one part not on the row itself.
    const parking = await sql<{ lat: number; long: number }[]>`
      select lat, long from public.geolocations where area_fk = ${Number(after.id)}`
    expect(parking).toEqual([{ lat: 47.1, long: 8.2 }])
  })

  it('brings a block back with every column it had', async () => {
    const [geolocation] = await sql<{ id: number }[]>`
      insert into public.geolocations (region_fk, lat, long, estimated)
      values (${regionId}, 47.3, 8.4, true) returning id`

    const [block] = await sql<{ id: number }[]>`
      insert into public.blocks (name, area_fk, region_fk, created_by, "order", geolocation_fk)
      values ('__fidelity_block__', ${cragAreaId}, ${regionId}, ${maintainer.userId}, 7, ${geolocation.id})
      returning id`

    const before = await rowByName('blocks', '__fidelity_block__')

    const deleted = await asRequest(maintainer.authId, () => deleteBlock({ id: block.id }))
    expect(deleted?.data?.mode, 'a fresh childless block should hard delete').toBe('hard')

    await asRequest(maintainer.authId, () => restoreBlock(deleted!.data!))

    const after = await rowByName('blocks', '__fidelity_block__')
    expect(comparable(after)).toEqual(comparable(before))

    // `geolocation_fk` is excluded from the comparison because the pin is recreated, so this is
    // what says the pin itself came back rather than a different one.
    const [pin] = await sql<{ estimated: boolean; lat: number; long: number }[]>`
      select estimated, lat, long from public.geolocations where id = ${Number(after.geolocation_fk)}`
    expect(pin).toEqual({ estimated: true, lat: 47.3, long: 8.4 })
  })

  it('brings a route back with every column it had', async () => {
    const [grade] = await sql<{ id: number }[]>`select id from public.grades order by id limit 1`

    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, description, rating, grade_fk, first_ascent_year)
      values ('__fidelity_route__', ${blockId}, ${regionId}, ${maintainer.userId}, '__fidelity_beta__',
              3, ${grade.id}, 1998)
      returning id`

    const before = await rowByName('routes', '__fidelity_route__')

    const deleted = await asRequest(maintainer.authId, () => deleteRoute({ id: route.id }))
    expect(deleted?.data?.mode, 'a fresh unclimbed route should hard delete').toBe('hard')

    await asRequest(maintainer.authId, () => restoreRoute(deleted!.data!))

    const after = await rowByName('routes', '__fidelity_route__')
    expect(comparable(after)).toEqual(comparable(before))
  })
})
