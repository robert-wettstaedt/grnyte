import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { topoLinesFingerprint } from './fingerprint'

// The topo mutators' wiring: what each answers and how a refusal arrives. The guards they share
// with the remote functions are covered by `topos.remote.test.ts` and `lines.remote.test.ts`.
const REGION = '__topo_mutators_region__'
const PATH = 'M0.1,0.9 L0.5,0.1'

let user: SeedUser
let regionId: number
let blockId: number
let routeId: number
let client: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_maintainer')
  user = seeded.user
  regionId = seeded.regionId
  client = zeroClient(user.authId)

  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__topo_mutators_area__', 'sector', ${regionId}, ${user.userId}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__topo_mutators_block__', ${area.id}, ${regionId}, ${user.userId}, 0) returning id`
  blockId = block.id
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__topo_mutators_route__', ${blockId}, ${regionId}, ${user.userId}) returning id`
  routeId = route.id
})

beforeEach(async () => {
  if (!reachable) return
  await sql`delete from public.topo_routes where region_fk = ${regionId}`
  await sql`delete from public.topos where region_fk = ${regionId}`
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.topo_routes where region_fk = ${regionId}`
  await sql`delete from public.topos where region_fk = ${regionId}`
  await sql`delete from public.files where region_fk = ${regionId}`
  await sql`delete from public.routes where region_fk = ${regionId}`
  await sql`delete from public.blocks where region_fk = ${regionId}`
  await sql`delete from public.areas where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
})

/** A block image with no stored bytes, so a delete or replace has nothing to tear down. */
async function blockImage() {
  const [file] = await sql<{ id: string }[]>`
    insert into public.files (id, path, region_fk, created_by, block_fk)
    values (gen_random_uuid()::text, '', ${regionId}, ${user.userId}, ${blockId}) returning id`
  return file.id
}

async function topo() {
  const result = await client.push('topos.create', { blockId, fileId: await blockImage() })
  return (result.data as { id: number }).id
}

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

describe.skipIf(!reachable)('topo mutators', () => {
  it('creates a topo on the block s image and answers its id', async () => {
    const fileId = await blockImage()
    const result = await client.push('topos.create', { blockId, fileId })
    const id = (result.data as undefined | { id: number })?.id

    const [stored] = await sql<{ file_fk: string }[]>`select file_fk from public.topos where id = ${id ?? -1}`
    expect(stored?.file_fk).toBe(fileId)
  })

  it('refuses a second topo on one image', async () => {
    const fileId = await blockImage()
    await client.push('topos.create', { blockId, fileId })

    expect(messageOf(await client.push('topos.create', { blockId, fileId }))).toBe('topo_alreadyTopo')
  })

  it('replaces the image and deletes the topo', async () => {
    const id = await topo()
    const fileId = await blockImage()

    expect((await client.push('topos.replaceImage', { fileId, topoId: id })).data).toEqual({ id })
    expect((await client.push('topos.delete', { id })).data).toEqual({ id })
    expect(await sql`select 1 from public.topos where id = ${id}`).toHaveLength(0)
  })

  it('reorders the block s topos', async () => {
    const first = await topo()
    const second = await topo()

    expect(await client.push('topos.reorder', { blockId, orderedIds: [second, first] })).toEqual({})
    const rows = await sql<{ id: number }[]>`select id from public.topos where block_fk = ${blockId} order by "order"`
    expect(rows.map((row) => row.id)).toEqual([second, first])
  })

  it('saves lines that name what it loaded, and refuses a stale save', async () => {
    const id = await topo()
    const line = { path: PATH, routeFk: routeId, topType: 'top' }

    expect(
      await client.push('topos.saveLines', { known: topoLinesFingerprint([]), lines: [line], topoId: id }),
    ).toEqual({})
    expect(await sql`select 1 from public.topo_routes where topo_fk = ${id}`).toHaveLength(1)

    const stale = await client.push('topos.saveLines', { known: topoLinesFingerprint([]), lines: [], topoId: id })
    expect(messageOf(stale)).toBe('topo_linesStale')
    expect(await sql`select 1 from public.topo_routes where topo_fk = ${id}`).toHaveLength(1)
  })
})
