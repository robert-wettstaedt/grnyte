import { reachable, sql } from '$lib/db/testDb'
import { readStoredName } from '$lib/entities/event/storedName'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { beforeAll, describe, expect, it } from 'vitest'

// `blocks.merge` through the mutator: routes, topos and one pin end on the survivor; the source's sector closes ranks.
const fx = useMaintainerRegion('__block_merge_region__')
const at = { north: 0, south: 0 }

beforeAll(async () => {
  if (!reachable) return
  const [north, south] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__bm_north__', 'sector', ${fx.regionId}, ${fx.user.userId}),
           ('__bm_south__', 'sector', ${fx.regionId}, ${fx.user.userId}) returning id`
  Object.assign(at, { north: north.id, south: south.id })
})

async function block(name: string, areaId: number, order: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values (${name}, ${areaId}, ${fx.regionId}, ${fx.user.userId}, ${order}) returning id`
  return row.id
}

async function pin(blockId: number, lat: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.geolocations (region_fk, block_fk, lat, long) values (${fx.regionId}, ${blockId}, ${lat}, 9) returning id`
  await sql`update public.blocks set geolocation_fk = ${row.id} where id = ${blockId}`
  return row.id
}

const merge = (sourceId: number, survivorId: number, values: Record<string, unknown> = {}) =>
  fx.client.push('blocks.merge', { sourceId, survivorId, values })

describe.skipIf(!reachable)('blocks.merge', () => {
  it('moves the routes and topos to the survivor, with chains for its sector', async () => {
    const survivor = await block('__bm_keep__', at.south, 0)
    const source = await block('__bm_dupe__', at.north, 0)
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, area_fks)
      values ('__bm_route__', ${source}, ${fx.regionId}, ${fx.user.userId}, ${[at.north]}) returning id`
    const fileId = `__bm_file_${source}__`
    await sql`insert into public.files (id, region_fk, path, block_fk) values (${fileId}, ${fx.regionId}, '/x', ${source})`
    const [topo] = await sql<{ id: number }[]>`
      insert into public.topos (region_fk, block_fk, file_fk) values (${fx.regionId}, ${source}, ${fileId}) returning id`

    expect((await merge(source, survivor)).error).toBeUndefined()

    expect(
      await sql`select block_fk as "blockFk", area_fks as "areaFks" from public.routes where id = ${route.id}`,
    ).toEqual([{ areaFks: [at.south], blockFk: survivor }])
    expect(await sql`select block_fk as "blockFk" from public.topos where id = ${topo.id}`).toEqual([
      { blockFk: survivor },
    ])
    expect(await sql`select block_fk as "blockFk" from public.files where id = ${fileId}`).toEqual([
      { blockFk: survivor },
    ])
  })

  it('keeps exactly the chosen pin and deletes the other', async () => {
    const survivor = await block('__bm_pin_keep__', at.south, 1)
    const source = await block('__bm_pin_dupe__', at.south, 2)
    const kept = await pin(survivor, 47.1)
    const chosen = await pin(source, 47.2)

    expect((await merge(source, survivor, { geolocationFk: chosen })).error).toBeUndefined()

    expect(await sql`select geolocation_fk as "pin" from public.blocks where id = ${survivor}`).toEqual([
      { pin: chosen },
    ])
    expect(
      await sql`select id, block_fk as "blockFk" from public.geolocations where id in ${sql([kept, chosen])}`,
    ).toEqual([{ blockFk: survivor, id: chosen }])
  })

  it('refuses a pin that belongs to neither block', async () => {
    const survivor = await block('__bm_badpin_keep__', at.south, 3)
    const source = await block('__bm_badpin_dupe__', at.south, 4)
    const stranger = await pin(await block('__bm_stranger__', at.south, 5), 47.3)

    expect((await merge(source, survivor, { geolocationFk: stranger })).error).toBe('app')
    expect(await sql`select deleted_at from public.blocks where id = ${source}`).toEqual([{ deleted_at: null }])
  })

  it('closes the gap the source leaves in its sector', async () => {
    const area = (
      await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by)
      values ('__bm_gap__', 'sector', ${fx.regionId}, ${fx.user.userId}) returning id`
    )[0].id
    const first = await block('__bm_gap_0__', area, 0)
    const source = await block('__bm_gap_1__', area, 1)
    const last = await block('__bm_gap_2__', area, 2)

    await merge(source, first)

    expect(
      await sql`select id, "order" from public.blocks where area_fk = ${area} and deleted_at is null order by "order"`,
    ).toEqual([
      { id: first, order: 0 },
      { id: last, order: 1 },
    ])
    expect(await sql`select merged_into as "mergedInto" from public.blocks where id = ${source}`).toEqual([
      { mergedInto: first },
    ])
  })

  it('records a nameless source by its slot, for each reader to name in their language', async () => {
    const area = (
      await sql<{ id: number }[]>`
      insert into public.areas (name, type, region_fk, created_by)
      values ('__bm_nameless__', 'sector', ${fx.regionId}, ${fx.user.userId}) returning id`
    )[0].id
    const survivor = await block('__bm_named__', area, 0)
    const source = await block('', area, 2)

    await merge(source, survivor)

    const [row] = await sql<{ newValue: string }[]>`
      select c.new_value as "newValue" from public.changes c join public.events e on e.id = c.event_fk
      where e.block_fk = ${survivor} and c.column_name = 'mergedFrom'`
    expect(readStoredName(row.newValue)).toBe('Block 3')
  })
})
