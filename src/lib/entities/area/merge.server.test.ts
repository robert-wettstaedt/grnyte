import { reachable, sql } from '$lib/db/testDb'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { describe, expect, it } from 'vitest'

// `areas.merge` through the mutator: the tree stays valid and everything under the source lands under the survivor.
const fx = useMaintainerRegion('__area_merge_region__')

const area = fx.area

async function block(areaId: number, order: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__am_block__', ${areaId}, ${fx.regionId}, ${fx.user.userId}, ${order}) returning id`
  return row.id
}

const merge = (sourceId: number, survivorId: number, values: Record<string, unknown> = {}) =>
  fx.client.push('areas.merge', { sourceId, survivorId, values })

const refusedWith = (result: { error?: string; message?: string }, key: string) => {
  expect(result.error).toBe('app')
  expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: key })
}

describe.skipIf(!reachable)('areas.merge', () => {
  it('refuses a survivor inside the source', async () => {
    const source = await area('__am_outer__', 'area')
    const inner = await area('__am_inner__', 'sector', source)

    refusedWith(await merge(source, inner), 'areas_mergeIntoOwnArea')
  })

  it('refuses areas holding different kinds of children', async () => {
    const withBlocks = await area('__am_blocks__', 'sector')
    await block(withBlocks, 0)
    const withAreas = await area('__am_areas__', 'area')
    await area('__am_child__', 'sector', withAreas)

    refusedWith(await merge(withBlocks, withAreas), 'areas_mergeMixedChildren')
  })

  it('folds an only child into its own parent', async () => {
    const parent = await area('__am_parent__', 'area')
    const only = await area('__am_only__', 'sector', parent)
    const kept = await block(only, 0)

    expect((await merge(only, parent)).error).toBeUndefined()
    const [row] = await sql<{ areaFk: number }[]>`select area_fk as "areaFk" from public.blocks where id = ${kept}`
    expect(row.areaFk).toBe(parent)
  })

  it('moves child areas, with the survivor in every route chain beneath', async () => {
    const top = await area('__am_top__', 'area')
    const survivor = await area('__am_keep__', 'area', top)
    const source = await area('__am_dupe__', 'area', top)
    const sector = await area('__am_sector__', 'sector', source)
    const [route] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by, area_fks)
      values ('__am_route__', ${await block(sector, 0)}, ${fx.regionId}, ${fx.user.userId}, ${[top, source, sector]}) returning id`

    expect((await merge(source, survivor)).error).toBeUndefined()

    expect(await sql`select parent_fk as "parentFk" from public.areas where id = ${sector}`).toEqual([
      { parentFk: survivor },
    ])
    expect(await sql`select area_fks as "areaFks" from public.routes where id = ${route.id}`).toEqual([
      { areaFks: [top, survivor, sector] },
    ])
    expect(await sql`select merged_into as "mergedInto" from public.areas where id = ${source}`).toEqual([
      { mergedInto: survivor },
    ])
  })

  it('appends the source’s blocks after the survivor’s and brings its parking into a sector', async () => {
    const survivor = await area('__am_sec_keep__', 'sector')
    const source = await area('__am_sec_dupe__', 'sector')
    const [k0, k1] = [await block(survivor, 0), await block(survivor, 1)]
    const [d0] = [await block(source, 0)]
    const [parking] = await sql<{ id: number }[]>`
      insert into public.geolocations (region_fk, area_fk, lat, long) values (${fx.regionId}, ${source}, 47, 9) returning id`

    expect((await merge(source, survivor)).error).toBeUndefined()

    expect(await sql`select id, "order" from public.blocks where area_fk = ${survivor} order by "order"`).toEqual([
      { id: k0, order: 0 },
      { id: k1, order: 1 },
      { id: d0, order: 2 },
    ])
    expect(await sql`select area_fk as "areaFk" from public.geolocations where id = ${parking.id}`).toEqual([
      { areaFk: survivor },
    ])
  })
})
