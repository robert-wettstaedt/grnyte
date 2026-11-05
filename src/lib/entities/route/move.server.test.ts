import { dropGuidebookRegion, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// `routes.move` through the mutator, as the caller: where a route lands, what follows it, and what refuses.
const REGION = '__route_move_region__'
const OTHER = '__route_move_other__'

let user: SeedUser
let regionId: number
let otherRegionId: number
let client: ReturnType<typeof zeroClient>
const ids = { north: 0, northBlock: 0, otherBlock: 0, south: 0, southBlock: 0 }

async function block(name: string, areaId: number, region: number, order = 0) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values (${name}, ${areaId}, ${region}, ${user.userId}, ${order}) returning id`
  return row.id
}

async function route(name: string, blockId: number, areaId: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
    values (${name}, ${blockId}, ${regionId}, ${user.userId}, ${[areaId]}, ${`^${areaId}$`}) returning id`
  return row.id
}

async function sector(name: string, region: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values (${name}, 'sector', ${region}, ${user.userId}) returning id`
  return row.id
}

const placed = async (id: number) =>
  (
    await sql<{ areaFks: number[]; areaIds: string; blockFk: number }[]>`
      select block_fk as "blockFk", area_fks as "areaFks", area_ids as "areaIds" from public.routes where id = ${id}`
  )[0]

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(REGION, 'region_maintainer')
  user = seeded.user
  regionId = seeded.regionId
  otherRegionId = (await seedRegion(OTHER, 'region_maintainer')).regionId
  client = zeroClient(user.authId)

  ids.north = await sector('__route_move_north__', regionId)
  ids.south = await sector('__route_move_south__', regionId)
  ids.northBlock = await block('__route_move_nb__', ids.north, regionId)
  ids.southBlock = await block('__route_move_sb__', ids.south, regionId)
  ids.otherBlock = await block('__route_move_ob__', await sector('__route_move_os__', otherRegionId), otherRegionId)
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await dropGuidebookRegion(regionId)
  await dropGuidebookRegion(otherRegionId)
})

const move = (routeIds: number[], blockId: number, knownTopoLines = 0) =>
  client.push('routes.move', { blockId, knownTopoLines, routeIds })

describe.skipIf(!reachable)('routes.move', () => {
  it('puts the route on the new block with the new area chain, and answers where it was', async () => {
    const id = await route('__route_move_one__', ids.northBlock, ids.north)

    const result = await move([id], ids.southBlock)

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({ previous: [{ blockId: ids.northBlock, id }] })
    expect(await placed(id)).toEqual({ areaFks: [ids.south], areaIds: `^${ids.south}$`, blockFk: ids.southBlock })
  })

  it('refuses a route the caller may not edit', async () => {
    const readOnly = (await seedRegion('__route_move_readonly__', 'region_user')).regionId
    const area = await sector('__route_move_ro_sector__', readOnly)
    const from = await block('__route_move_ro_a__', area, readOnly)
    const to = await block('__route_move_ro_b__', area, readOnly, 1)
    const [row] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__route_move_ro__', ${from}, ${readOnly}, ${user.userId}) returning id`
    try {
      const result = await move([row.id], to)
      expect(result.error).toBe('app')
      expect((await placed(row.id)).blockFk).toBe(from)
    } finally {
      await sql`delete from public.routes where region_fk = ${readOnly}`
      await sql`delete from public.blocks where region_fk = ${readOnly}`
      await sql`delete from public.areas where region_fk = ${readOnly}`
      await sql`delete from public.region_members where region_fk = ${readOnly}`
      await sql`delete from public.regions where id = ${readOnly}`
    }
  })

  it('refuses a block in another region, even one the caller may edit', async () => {
    const id = await route('__route_move_cross__', ids.northBlock, ids.north)

    expect((await move([id], ids.otherBlock)).error).toBe('app')
    expect((await placed(id)).blockFk).toBe(ids.northBlock)
  })

  it('refuses a deleted block and one under a deleted sector', async () => {
    const id = await route('__route_move_gone__', ids.northBlock, ids.north)
    const deletedBlock = await block('__route_move_deleted__', ids.south, regionId, 5)
    await sql`update public.blocks set deleted_at = now() where id = ${deletedBlock}`
    const goneSector = await sector('__route_move_gone_sector__', regionId)
    const stranded = await block('__route_move_stranded__', goneSector, regionId)
    await sql`update public.areas set deleted_at = now() where id = ${goneSector}`

    expect((await move([id], deletedBlock)).error).toBe('app')
    expect((await move([id], stranded)).error).toBe('app')
    expect((await placed(id)).blockFk).toBe(ids.northBlock)
  })

  it('changes nothing for a route already on that block', async () => {
    const id = await route('__route_move_same__', ids.northBlock, ids.north)

    const result = await move([id], ids.northBlock)

    expect(result.data).toEqual({ previous: [] })
    expect(await sql`select 1 from public.events where route_fk = ${id}`).toHaveLength(0)
  })

  describe('topo lines', () => {
    async function drawnOnNorth(routeId: number) {
      const fileId = `__route_move_file_${routeId}__`
      await sql`insert into public.files (id, region_fk, path, block_fk) values (${fileId}, ${regionId}, '/x', ${ids.northBlock})`
      const [topo] = await sql<{ id: number }[]>`
        insert into public.topos (region_fk, block_fk, file_fk) values (${regionId}, ${ids.northBlock}, ${fileId}) returning id`
      await sql`insert into public.topo_routes (region_fk, top_type, topo_fk, route_fk) values (${regionId}, 'start', ${topo.id}, ${routeId})`
    }
    const lines = async (routeId: number) =>
      (await sql`select 1 from public.topo_routes where route_fk = ${routeId}`).length

    it('drops the lines on the old block when the count matches what the person saw', async () => {
      const id = await route('__route_move_drawn__', ids.northBlock, ids.north)
      await drawnOnNorth(id)

      const result = await move([id], ids.southBlock, 1)

      expect(result.error).toBeUndefined()
      expect(await lines(id)).toBe(0)
    })

    it('refuses before any write when a line was drawn after the confirmation', async () => {
      const id = await route('__route_move_stale__', ids.northBlock, ids.north)
      await drawnOnNorth(id)

      const result = await move([id], ids.southBlock, 0)

      expect(result.error).toBe('app')
      expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'routes_moveTopoLinesChanged' })
      expect(await lines(id)).toBe(1)
      expect((await placed(id)).blockFk).toBe(ids.northBlock)
    })
  })

  it('records the move as a parent change naming both blocks', async () => {
    const id = await route('__route_move_event__', ids.northBlock, ids.north)

    await move([id], ids.southBlock)

    const changes = await sql<{ newValue: string; oldValue: string }[]>`
      select c.old_value as "oldValue", c.new_value as "newValue"
      from public.changes c join public.events e on e.id = c.event_fk
      where e.route_fk = ${id} and c.column_name = 'parent'`
    expect(changes).toEqual([{ newValue: '__route_move_sb__', oldValue: '__route_move_nb__' }])
  })
})
