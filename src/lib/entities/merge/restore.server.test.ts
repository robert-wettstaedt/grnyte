import { reachable, sql } from '$lib/db/testDb'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { describe, expect, it } from 'vitest'

// A merged source refuses every restore request, at every level, and stays deleted.
const fx = useMaintainerRegion('__merge_restore_region__')

async function block(areaId: number, order: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__merge_restore_block__', ${areaId}, ${fx.regionId}, ${fx.user.userId}, ${order}) returning id`
  return row.id
}

async function retire(table: 'areas' | 'blocks' | 'routes', source: number, survivor: number) {
  await sql`update ${sql(table)} set deleted_at = now(), merged_into = ${survivor} where id = ${source}`
}

async function route(blockId: number) {
  const [row] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__merge_restore_route__', ${blockId}, ${fx.regionId}, ${fx.user.userId}) returning id`
  return row.id
}

async function sector() {
  const [row] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__merge_restore_sector__', 'sector', ${fx.regionId}, ${fx.user.userId}) returning id`
  return row.id
}

const stillDeleted = async (table: 'areas' | 'blocks' | 'routes', id: number) =>
  (await sql<{ deletedAt: null | string }[]>`select deleted_at as "deletedAt" from ${sql(table)} where id = ${id}`)[0]
    .deletedAt != null

const refusedAsMerged = (result: { error?: string; message?: string }) => {
  expect(result.error).toBe('app')
  expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'merges_restoreRefused' })
}

describe.skipIf(!reachable)('restoring a merged source', () => {
  it('refuses a route', async () => {
    const at = await block(await sector(), 0)
    const [source, survivor] = [await route(at), await route(at)]
    await retire('routes', source, survivor)

    refusedAsMerged(await fx.client.push('routes.restore', { mode: 'soft', routeId: source }))
    expect(await stillDeleted('routes', source)).toBe(true)
  })

  it('refuses a block', async () => {
    const area = await sector()
    const [source, survivor] = [await block(area, 0), await block(area, 1)]
    await retire('blocks', source, survivor)

    refusedAsMerged(await fx.client.push('blocks.restore', { blockId: source, mode: 'soft' }))
    expect(await stillDeleted('blocks', source)).toBe(true)
  })

  it('refuses an area', async () => {
    const [source, survivor] = [await sector(), await sector()]
    await retire('areas', source, survivor)

    refusedAsMerged(await fx.client.push('areas.restore', { areaId: source, mode: 'soft' }))
    expect(await stillDeleted('areas', source)).toBe(true)
  })

  it('is held by the database for any other path', async () => {
    const [source, survivor] = [await sector(), await sector()]
    await retire('areas', source, survivor)

    await expect(sql`update public.areas set deleted_at = null where id = ${source}`).rejects.toThrow(
      /areas_merged_is_deleted/,
    )
  })
})
