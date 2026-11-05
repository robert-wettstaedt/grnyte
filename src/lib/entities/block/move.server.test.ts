import { reachable, sql } from '$lib/db/testDb'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { describe, expect, it } from 'vitest'

// `blocks.move` through the mutator, as the caller: slots on both sides, Undo, chains, refusals.
const REGION_NAME = '__block_move_region__'
const fx = useMaintainerRegion(REGION_NAME)

const area = fx.area

/** Blocks in slot order, each with one route carrying the area's chain. */
async function blocksIn(areaId: number, names: string[]) {
  const made: number[] = []
  for (const [order, name] of names.entries()) {
    const [row] = await sql<{ id: number }[]>`
      insert into public.blocks (name, area_fk, region_fk, created_by, "order")
      values (${name}, ${areaId}, ${fx.regionId}, ${fx.user.userId}, ${order}) returning id`
    await sql`
      insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
      values (${name}, ${row.id}, ${fx.regionId}, ${fx.user.userId}, ${[areaId]}, ${`^${areaId}$`})`
    made.push(row.id)
  }
  return made
}

const slots = async (areaId: number) =>
  (
    await sql<{ id: number }[]>`
      select id from public.blocks where area_fk = ${areaId} and deleted_at is null order by "order", id`
  ).map((row) => row.id)

const orders = async (areaId: number) =>
  (
    await sql<{ order: number }[]>`
      select "order" from public.blocks where area_fk = ${areaId} and deleted_at is null order by "order", id`
  ).map((row) => row.order)

type Previous = { previous: { areaId: number; order: number[] }[] }
const move = (blockIds: number[], areaId: number, restoreOrder?: number[]) =>
  fx.client.push('blocks.move', { areaId, blockIds, restoreOrder })

describe.skipIf(!reachable)('blocks.move', () => {
  it('appends the blocks to the new sector in the order given and closes the gaps they leave', async () => {
    const north = await area('__block_move_north__', 'sector')
    const south = await area('__block_move_south__', 'sector')
    const [n0, n1, n2, n3, n4, n5] = await blocksIn(north, ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'])
    const [s0, s1, s2] = await blocksIn(south, ['s0', 's1', 's2'])

    const result = await move([n2, n5], south)

    expect(result.error).toBeUndefined()
    expect(await slots(south)).toEqual([s0, s1, s2, n2, n5])
    expect(await orders(south)).toEqual([0, 1, 2, 3, 4])
    expect(await slots(north)).toEqual([n0, n1, n3, n4])
    expect(await orders(north)).toEqual([0, 1, 2, 3])
    expect(result.data).toEqual({ previous: [{ areaId: north, order: [n0, n1, n2, n3, n4, n5] }] })
  })

  it('puts a block back in its old slot on Undo', async () => {
    const north = await area('__block_move_undo_n__', 'sector')
    const south = await area('__block_move_undo_s__', 'sector')
    const [a, b, c, d] = await blocksIn(north, ['a', 'b', 'c', 'd'])

    const { previous } = (await move([c], south)).data as Previous
    const undone = await move([c], previous[0].areaId, previous[0].order)

    expect(undone.error).toBeUndefined()
    expect(await slots(north)).toEqual([a, b, c, d])
    expect(await orders(north)).toEqual([0, 1, 2, 3])
  })

  it('refuses an area that holds areas', async () => {
    const north = await area('__block_move_ref_n__', 'sector')
    const parent = await area('__block_move_ref_p__', 'area')
    await area('__block_move_ref_child__', 'sector', parent)
    const [only] = await blocksIn(north, ['only'])

    expect((await move([only], parent)).error).toBe('app')
    expect(await slots(north)).toEqual([only])
  })

  it('leaves the order alone when the block is already in that sector', async () => {
    const north = await area('__block_move_same__', 'sector')
    const [a, b, c] = await blocksIn(north, ['a', 'b', 'c'])
    await sql`update public.blocks set "order" = 7 where id = ${c}`

    const result = await move([a], north)

    expect(result.data).toEqual({ previous: [] })
    expect(await orders(north)).toEqual([0, 1, 7])
    expect(await slots(north)).toEqual([a, b, c])
  })

  it('rewrites the routes chains and both areas types, and records the move', async () => {
    const top = await area('__block_move_top__', 'area')
    const from = await area('__block_move_from__', 'sector', top)
    const to = await area('__block_move_to__', null, top)
    const [only] = await blocksIn(from, ['__block_move_mover__'])

    await move([only], to)

    const [route] = await sql<
      { areaFks: number[] }[]
    >`select area_fks as "areaFks" from public.routes where block_fk = ${only}`
    expect(route.areaFks).toEqual([top, to])
    const types = await sql<{ id: number; type: null | string }[]>`
      select id, type from public.areas where id in ${sql([from, to])} order by id`
    expect(types).toEqual([
      { id: from, type: null },
      { id: to, type: 'sector' },
    ])
    const changes = await sql<{ newValue: string; oldValue: string }[]>`
      select c.old_value as "oldValue", c.new_value as "newValue"
      from public.changes c join public.events e on e.id = c.event_fk
      where e.block_fk = ${only} and c.column_name = 'parent'`
    expect(changes).toEqual([{ newValue: '__block_move_to__', oldValue: '__block_move_from__' }])
  })
})
