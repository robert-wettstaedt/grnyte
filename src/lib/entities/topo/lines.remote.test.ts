/**
 * `saveTopoLines`' staleness refusal, through the real handler in a real RLS transaction.
 *
 * No sync lag needed: two admins on one photo is enough, because the second Save carries a set that
 * never held the first one's line. Scoped to route ids, so a moved line is deliberately not stale.
 */
import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { topoLinesFingerprint } from './fingerprint'
import { saveTopoLines } from './topos.remote'

const REGION = '__topo_lines_region__'
const PATH_ONE = 'M0.1,0.9 L0.2,0.1'
const PATH_TWO = 'M0.5,0.9 L0.6,0.1'

let maintainer: SeedUser
let regionId = 0
let blockId = 0
let topoId = 0
let routeOne = 0
let routeTwo = 0

beforeAll(async () => {
  if (!reachable) return

  const seeded = await seedRegion(REGION)
  maintainer = seeded.user
  regionId = seeded.regionId

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__topo_lines_area__', 'sector', ${regionId}, ${maintainer.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, "order", region_fk, created_by)
    values ('__topo_lines_block__', ${area.id}, 0, ${regionId}, ${maintainer.userId}) returning id`
  blockId = block.id

  const [file] = await sql<{ id: string }[]>`
    insert into public.files (id, path, region_fk, created_by, block_fk)
    values (gen_random_uuid()::text, '/topos/lines.jpg', ${regionId}, ${maintainer.userId}, ${blockId})
    returning id`
  const [topo] = await sql<{ id: number }[]>`
    insert into public.topos (region_fk, block_fk, file_fk, "order")
    values (${regionId}, ${blockId}, ${file.id}, 0) returning id`
  topoId = topo.id

  // Both live and both on this block: `saveTopoLines` refuses a routeFk that is neither.
  for (const name of ['__topo_lines_one__', '__topo_lines_two__']) {
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values (${name}, ${blockId}, ${regionId}, ${maintainer.userId}) returning id`
    if (routeOne === 0) routeOne = route.id
    else routeTwo = route.id
  }
})

/** Back to two drawn lines before each case, so a refusal cannot pass on the previous one's state. */
beforeEach(async () => {
  if (!reachable) return

  await sql`delete from public.topo_routes where topo_fk = ${topoId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`
    insert into public.topo_routes (region_fk, topo_fk, route_fk, path, top_type) values
      (${regionId}, ${topoId}, ${routeOne}, ${PATH_ONE}, 'top'),
      (${regionId}, ${topoId}, ${routeTwo}, ${PATH_TWO}, 'top')`
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.changes where region_fk = ${regionId}`
    await sql`delete from public.events where region_fk = ${regionId}`
    await sql`delete from public.topo_routes where region_fk = ${regionId}`
    await sql`delete from public.topos where region_fk = ${regionId}`
    await sql`delete from public.files where region_fk = ${regionId}`
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

/** A refusal is `error(409, ...)`, which throws out of a command rather than being folded into form
 *  issues, so unlike the route form this one IS catchable. Anything else is rethrown. */
async function save(known: string | undefined, lines: { path: string; routeFk: number }[]): Promise<'ok' | 'refused'> {
  try {
    await asRequest(maintainer.authId, () =>
      saveTopoLines({ known, lines: lines.map((line) => ({ ...line, topType: 'top' as const })), topoId }),
    )
    return 'ok'
  } catch (cause) {
    if ((cause as { status?: number })?.status === 409) return 'refused'
    throw cause
  }
}

const drawnRoutes = async () =>
  (
    await sql<{ routeFk: number }[]>`
      select route_fk as "routeFk" from public.topo_routes
      where topo_fk = ${topoId} and path is not null and path <> '' order by route_fk`
  ).map((row) => row.routeFk)

const pathFor = async (routeFk: number) =>
  (
    await sql<{ path: null | string }[]>`
    select path from public.topo_routes where topo_fk = ${topoId} and route_fk = ${routeFk}`
  ).at(0)?.path

const currentFingerprint = async () => topoLinesFingerprint(await drawnRoutes())

describe.skipIf(!reachable)('saveTopoLines staleness guard', () => {
  it('accepts a save whose fingerprint still describes the stored lines', async () => {
    // The positive control for every refusal below: same call shape, and it lands.
    const known = await currentFingerprint()

    expect(await save(known, [{ path: PATH_ONE, routeFk: routeOne }])).toBe('ok')
    expect(await drawnRoutes()).toEqual([routeOne])
  })

  it('refuses a save that never saw a line another editor added, and deletes nothing', async () => {
    // The second admin loaded one line. The first drew a second and saved. Without the guard this
    // Save posts only what it knew about and erases the other one.
    const stale = topoLinesFingerprint([routeOne])

    expect(await save(stale, [{ path: PATH_ONE, routeFk: routeOne }])).toBe('refused')
    expect(await drawnRoutes()).toEqual([routeOne, routeTwo].sort((a, b) => a - b))
  })

  it('refuses a save that omits the fingerprint, so an old client cannot bypass it', async () => {
    // Defaulted to '' rather than left optional: '' can never equal a real fingerprint, which
    // always carries a count prefix, so the omission fails the comparison rather than skipping it.
    expect(await save(undefined, [{ path: PATH_ONE, routeFk: routeOne }])).toBe('refused')
    expect(await drawnRoutes()).toEqual([routeOne, routeTwo].sort((a, b) => a - b))
  })

  it('refuses the empty set an editor that never loaded the lines would post', async () => {
    expect(await save(topoLinesFingerprint([]), [])).toBe('refused')
    expect(await drawnRoutes()).toEqual([routeOne, routeTwo].sort((a, b) => a - b))
  })

  it('refuses before the first write, so a rejected save leaves no half-applied upsert', async () => {
    // The submitted path for route one differs from what is stored. If the guard ran after the
    // upsert loop the refusal would still have moved that line.
    const stale = topoLinesFingerprint([routeOne])

    expect(await save(stale, [{ path: 'M0.9,0.9 L0.9,0.1', routeFk: routeOne }])).toBe('refused')
    expect(await pathFor(routeOne)).toBe(PATH_ONE)
  })

  it('ignores a line whose path cannot be parsed, because the editor never showed it', async () => {
    // `toTopoViews` drops lines that parse to no points, so the editor can never name this one.
    // Counting it server-side would make the photo permanently unsaveable.
    await sql`update public.topo_routes set path = 'Z' where topo_fk = ${topoId} and route_fk = ${routeTwo}`

    expect(await save(topoLinesFingerprint([routeOne]), [{ path: PATH_ONE, routeFk: routeOne }])).toBe('ok')
  })

  it('accepts a moved line, because a move is not a replacement', async () => {
    // The deliberate scope limit. `erased()` deletes on route membership, so that is all the guard
    // measures. Widening it to paths would refuse this save, which takes nothing away.
    const moved = 'M0.9,0.9 L0.9,0.1'

    expect(
      await save(await currentFingerprint(), [
        { path: moved, routeFk: routeOne },
        { path: PATH_TWO, routeFk: routeTwo },
      ]),
    ).toBe('ok')
    expect(await pathFor(routeOne)).toBe(moved)
    expect(await drawnRoutes()).toEqual([routeOne, routeTwo].sort((a, b) => a - b))
  })
})
