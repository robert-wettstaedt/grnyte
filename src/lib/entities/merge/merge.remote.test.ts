import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { useMaintainerRegion } from '$lib/remote/testRegion'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mergePreview } from './merge.remote'

// What a merge's confirmation is told it will carry, and who may ask.
const fx = useMaintainerRegion('__merge_preview_region__')
let outsider: SeedUser
const ids = { block: 0, survivor: 0 }

beforeAll(async () => {
  if (!reachable) return
  outsider = await createThrowawayUser('merge_preview')
  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__mp_sector__', 'sector', ${fx.regionId}, ${fx.user.userId}) returning id`
  const [block, survivor] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__mp_source__', ${sector.id}, ${fx.regionId}, ${fx.user.userId}, 0),
           ('__mp_keep__', ${sector.id}, ${fx.regionId}, ${fx.user.userId}, 1) returning id`
  const [a, b] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__mp_a__', ${block.id}, ${fx.regionId}, ${fx.user.userId}),
           ('__mp_b__', ${block.id}, ${fx.regionId}, ${fx.user.userId}) returning id`
  await sql`insert into public.ascents (region_fk, created_by, type, route_fk)
    values (${fx.regionId}, ${fx.user.userId}, 'flash', ${a.id}), (${fx.regionId}, ${fx.user.userId}, 'redpoint', ${a.id}),
           (${fx.regionId}, ${fx.user.userId}, 'flash', ${b.id})`
  await sql`insert into public.ascents (region_fk, created_by, type, route_fk, deleted_at)
    values (${fx.regionId}, ${fx.user.userId}, 'attempt', ${b.id}, now())`
  await sql`insert into public.files (id, region_fk, path, block_fk)
    values ('__mp_photo_1__', ${fx.regionId}, '/1', ${block.id}), ('__mp_photo_2__', ${fx.regionId}, '/2', ${block.id})`
  await sql`insert into public.topos (region_fk, block_fk, file_fk) values (${fx.regionId}, ${block.id}, '__mp_photo_1__')`
  Object.assign(ids, { block: block.id, survivor: survivor.id })
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.ascents where region_fk = ${fx.regionId}`
  await dropThrowawayUser(outsider)
})

describe.skipIf(!reachable)('mergePreview', () => {
  it('counts what a block merge carries', async () => {
    const preview = await asRequest(fx.user.authId, () =>
      mergePreview({ kind: 'blocks', sourceId: ids.block, survivorId: ids.survivor }),
    )

    // __mp_photo_1__ is the topo's photo, so it counts once, under topos.
    expect(preview).toEqual({ ascents: 3, children: 2, photos: 1, topoLinesRemoved: 0, topos: 1 })
  })

  it('refuses a member who may not delete the source', async () => {
    await sql`insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${fx.regionId}, ${outsider.userId}, ${outsider.authId}, 'region_user', true)`
    try {
      const status = await statusOf(() =>
        asRequest(outsider.authId, () =>
          mergePreview({ kind: 'blocks', sourceId: ids.block, survivorId: ids.survivor }),
        ),
      )
      expect(status).toBe(403)
    } finally {
      await sql`delete from public.region_members where user_fk = ${outsider.userId}`
    }
  })

  it('refuses someone outside the region', async () => {
    const status = await statusOf(() =>
      asRequest(outsider.authId, () => mergePreview({ kind: 'blocks', sourceId: ids.block, survivorId: ids.survivor })),
    )

    expect(status).toBe(404)
  })
})
