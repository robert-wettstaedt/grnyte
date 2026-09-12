/**
 * `updateRoute`'s staleness refusal, through the real handler in a real RLS transaction.
 *
 * An unloaded tag list and a deliberately cleared one are identical on the wire; `known` is what
 * tells them apart. Assert on the database afterwards, never the thrown value.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, callForm } from '$lib/remote/testHarness'
import { isValidationError } from '@sveltejs/kit'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { routeListsFingerprint } from './fingerprint'
import { updateRoute } from './routes.remote'

const REGION = '__routes_remote_region__'
const TAG = 'benchmark'
const CLIMBER = 'Ada Erstbegeherin'

let maintainer: SeedUser
let regionId = 0
let sectorId = 0
let blockId = 0
let routeId = 0
let climberId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer

  // `allowedTags` filters against the vocabulary, so a tag this region lacks would be dropped
  // before the fingerprint disagreed and the test would pass for the wrong reason.
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, settings)
    values (${REGION}, ${maintainer.userId}, ${sql.json({ mapLayers: [], tags: [TAG, 'defined'] } as never)})
    returning id`
  regionId = region.id

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)`

  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__routes_remote_sector__', 'sector', ${regionId}, ${maintainer.userId}) returning id`
  sectorId = sector.id

  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, "order", region_fk, created_by)
    values ('__routes_remote_block__', ${sectorId}, 0, ${regionId}, ${maintainer.userId}) returning id`
  blockId = block.id

  const [climber] = await sql<{ id: number }[]>`
    insert into public.first_ascensionists (region_fk, name) values (${regionId}, ${CLIMBER}) returning id`
  climberId = climber.id
})

/** Back to one tag and one first ascensionist before each case, so a refusal test cannot pass on
 *  leftovers from the one before it. */
beforeEach(async () => {
  if (!reachable) return

  await sql`delete from public.routes_to_tags where region_fk = ${regionId}`
  await sql`delete from public.routes_to_first_ascensionists where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`

  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
    values ('Stale Probe', ${blockId}, ${regionId}, ${maintainer.userId}, ${[sectorId]}, ${`^${sectorId}$`})
    returning id`
  routeId = route.id

  await sql`
    insert into public.routes_to_tags (region_fk, route_fk, tag_fk) values (${regionId}, ${routeId}, ${TAG})`
  await sql`
    insert into public.routes_to_first_ascensionists (region_fk, first_ascensionist_fk, route_fk)
    values (${regionId}, ${climberId}, ${routeId})`
})

afterAll(async () => {
  if (reachable) {
    // The FK graph, innermost first. `first_ascensionists` last of the route's own tree: the
    // junction rows point at it.
    await sql`delete from public.routes_to_tags where region_fk = ${regionId}`
    await sql`delete from public.routes_to_first_ascensionists where region_fk = ${regionId}`
    await sql`delete from public.changes where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.first_ascensionists where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

/**
 * Run the handler. No 'refused' return value on purpose: Kit catches `ValidationError` and records
 * it as form issues, so a refused call and a successful one both resolve. The database separates
 * them, because the unconditional rename sits after the guard. A 303 is success.
 */
async function submit(data: Record<string, unknown>): Promise<void> {
  try {
    await asRequest(maintainer.authId, () => callForm(updateRoute, data))
  } catch (cause) {
    if (isValidationError(cause)) return
    if ((cause as { status?: number })?.status === 303) return
    throw cause
  }
}

/** The submit a loaded form makes: both lists as they are stored, plus whatever `known` is given. */
const editWith = (known: string | undefined, name: string) => ({
  blockId: String(blockId),
  firstAscensionists: [{ name: CLIMBER }],
  id: String(routeId),
  known,
  name,
  tags: [TAG],
})

const storedName = async () =>
  (await sql<{ name: null | string }[]>`select name from public.routes where id = ${routeId}`).at(0)?.name

const storedTags = async () =>
  (
    await sql<{ tagFk: string }[]>`
      select tag_fk as "tagFk" from public.routes_to_tags where route_fk = ${routeId} order by tag_fk`
  ).map((row) => row.tagFk)

const storedClimbers = async () =>
  (
    await sql<{ name: string }[]>`
      select fa.name from public.routes_to_first_ascensionists rfa
      join public.first_ascensionists fa on fa.id = rfa.first_ascensionist_fk
      where rfa.route_fk = ${routeId} order by fa.name`
  ).map((row) => row.name)

const currentFingerprint = async () => routeListsFingerprint(await storedTags(), [{ name: CLIMBER }])

describe.skipIf(!reachable)('updateRoute staleness guard', () => {
  it('accepts a submit whose fingerprint still describes the stored lists', async () => {
    await submit(editWith(await currentFingerprint(), 'Renamed Probe'))

    // The positive control for every refusal below: this is the same call shape, and it lands.
    expect(await storedName()).toBe('Renamed Probe')
    expect(await storedTags()).toEqual([TAG])
    expect(await storedClimbers()).toEqual([CLIMBER])
  })

  it('refuses a submit whose lists changed underneath it, and writes nothing at all', async () => {
    // The form loaded one tag and computed `known` from it. Another admin tagged the route while
    // the page sat open, which is d6's `renameRegionTag` scenario with the names left alone.
    const known = await currentFingerprint()
    await sql`
      insert into public.routes_to_tags (region_fk, route_fk, tag_fk) values (${regionId}, ${routeId}, 'defined')`

    await submit(editWith(known, 'Should Not Land'))

    // The refusal has to precede the first write, not merely the list diffs: a handler that renamed
    // the route and then refused would leave the reader looking at a save that half happened.
    expect(await storedName()).toBe('Stale Probe')
    expect(await storedTags()).toEqual([TAG, 'defined'])
    expect(await storedClimbers()).toEqual([CLIMBER])
  })

  it('refuses a submit that omits the fingerprint, so the optional field is not a way around it', async () => {
    // Optional in the schema because `createRoute` shares it. `undefined` never equals a real
    // fingerprint, which always carries a count prefix, so the omission is refused.
    await submit(editWith(undefined, 'Should Not Land Either'))

    expect(await storedName()).toBe('Stale Probe')
    expect(await storedTags()).toEqual([TAG])
    expect(await storedClimbers()).toEqual([CLIMBER])
  })

  it('refuses the empty-list fingerprint a never-loaded form would post', async () => {
    // The actual shipped bug, reduced: the form opened on a bare route row, so both lists were
    // empty and it posted them back. Without the guard this deleted the tag and the climber.
    await submit({ ...editWith(routeListsFingerprint([], []), 'Wiped'), firstAscensionists: [], tags: [] })

    expect(await storedName()).toBe('Stale Probe')
    expect(await storedTags()).toEqual([TAG])
    expect(await storedClimbers()).toEqual([CLIMBER])
  })
})
