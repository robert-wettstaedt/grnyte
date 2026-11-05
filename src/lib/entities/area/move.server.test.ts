import { reachable, seedRegion, sql } from '$lib/db/testDb'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { describe, expect, it } from 'vitest'

// `areas.move` through the mutator, as the caller: the tree stays a tree, and everything under follows.
const REGION_NAME = '__area_move_region__'
const fx = useMaintainerRegion(REGION_NAME)

async function area(
  name: string,
  type: 'area' | 'sector' | null,
  parentFk: null | number = null,
  region = fx.regionId,
) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by)
    values (${name}, ${type}, ${parentFk}, ${region}, ${fx.user.userId}) returning id`
  return row.id
}

async function routeUnder(sectorId: number, chain: number[]) {
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__area_move_block__', ${sectorId}, ${fx.regionId}, ${fx.user.userId}, 0) returning id`
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
    values ('__area_move_route__', ${block.id}, ${fx.regionId}, ${fx.user.userId}, ${chain}, ${chain.map((id) => `^${id}$`).join(',')})
    returning id`
  return route.id
}

const parentOf = async (id: number) =>
  (await sql<{ parentFk: null | number }[]>`select parent_fk as "parentFk" from public.areas where id = ${id}`)[0]
    .parentFk

const move = (areaIds: number[], parentId: null | number) => fx.client.push('areas.move', { areaIds, parentId })

describe.skipIf(!reachable)('areas.move', () => {
  it('moves an area with its subtree, rewriting every chain beneath and both parents types', async () => {
    const from = await area('__area_move_from__', 'area')
    const to = await area('__area_move_to__', null)
    const moved = await area('__area_move_moved__', 'area', from)
    const sector = await area('__area_move_sector__', 'sector', moved)
    const route = await routeUnder(sector, [from, moved, sector])

    const result = await move([moved], to)

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({ previous: [{ id: moved, parentId: from }] })
    expect(await parentOf(moved)).toBe(to)
    const [row] = await sql<
      { areaFks: number[] }[]
    >`select area_fks as "areaFks" from public.routes where id = ${route}`
    expect(row.areaFks).toEqual([to, moved, sector])
    const types = await sql<
      { type: null | string }[]
    >`select type from public.areas where id in ${sql([from, to])} order by id`
    expect(types.map((t) => t.type)).toEqual([null, 'area'])
  })

  it('moves an area to the top level', async () => {
    const parent = await area('__area_move_top_p__', 'area')
    const child = await area('__area_move_top_c__', 'sector', parent)

    expect((await move([child], null)).error).toBeUndefined()
    expect(await parentOf(child)).toBeNull()
  })

  it('refuses a move under itself or anything beneath it', async () => {
    const top = await area('__area_move_cycle_top__', 'area')
    const mid = await area('__area_move_cycle_mid__', 'area', top)

    expect((await move([top], mid)).error).toBe('app')
    expect((await move([top], top)).error).toBe('app')
    expect(await parentOf(top)).toBeNull()
  })

  it('refuses a move under a sector', async () => {
    const sector = await area('__area_move_sec__', 'sector')
    const lone = await area('__area_move_lone__', 'area')

    expect((await move([lone], sector)).error).toBe('app')
    expect(await parentOf(lone)).toBeNull()
  })

  it('refuses a member without edit rights, also to the top level', async () => {
    const readOnly = (await seedRegion('__area_move_ro__', 'region_user')).regionId
    const parent = await area('__area_move_ro_p__', 'area', null, readOnly)
    const child = await area('__area_move_ro_c__', 'area', parent, readOnly)
    try {
      expect((await move([child], null)).error).toBe('app')
      expect(await parentOf(child)).toBe(parent)
    } finally {
      await sql`delete from public.areas where id = ${child}`
      await sql`delete from public.areas where id = ${parent}`
      await sql`delete from public.region_members where region_fk = ${readOnly}`
      await sql`delete from public.regions where id = ${readOnly}`
    }
  })

  it('records the move naming the old parent and the region for the top level', async () => {
    const parent = await area('__area_move_ev_p__', 'area')
    const child = await area('__area_move_ev_c__', 'area', parent)

    await move([child], null)

    const changes = await sql<{ newValue: string; oldValue: string }[]>`
      select c.old_value as "oldValue", c.new_value as "newValue"
      from public.changes c join public.events e on e.id = c.event_fk
      where e.area_fk = ${child} and c.column_name = 'parent'`
    expect(changes).toEqual([{ newValue: REGION_NAME, oldValue: '__area_move_ev_p__' }])
  })
})
