/**
 * `stampDeletedAt` on a real subtree: a delete stamps only live rows, and a restore clears only the
 * rows carrying that stamp, so a child deleted on its own stays deleted. Skipped without DATABASE_URL.
 */
import * as schema from '$lib/db/schema'
import { reachable, seedRegion, sql } from '$lib/db/testDb'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { stampDeletedAt } from './area.server'

const db = drizzle(sql, { schema })
const NAME = '__stamp_deleted_at__'
const EARLIER = new Date('2026-01-01T00:00:00Z')

let regionId = 0
let ids = {
  area: 0,
  block: 0,
  loneRoute: 0,
  route: 0,
  sector: 0,
  separateBlock: 0,
  separateRoute: 0,
  separateSector: 0,
}

const deletedAt = async () =>
  Object.fromEntries(
    (
      await sql<{ deletedAt: Date | null | string; key: string }[]>`
        select 'area' as key, deleted_at as "deletedAt" from public.areas where id = ${ids.area}
        union all select 'sector', deleted_at from public.areas where id = ${ids.sector}
        union all select 'separateSector', deleted_at from public.areas where id = ${ids.separateSector}
        union all select 'block', deleted_at from public.blocks where id = ${ids.block}
        union all select 'separateBlock', deleted_at from public.blocks where id = ${ids.separateBlock}
        union all select 'route', deleted_at from public.routes where id = ${ids.route}
        union all select 'separateRoute', deleted_at from public.routes where id = ${ids.separateRoute}
        union all select 'loneRoute', deleted_at from public.routes where id = ${ids.loneRoute}`
    ).map(({ deletedAt, key }) => [key, deletedAt == null ? null : new Date(deletedAt).toISOString()]),
  )

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(NAME)
  regionId = seeded.regionId
  const by = seeded.user.userId
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by) values (${NAME}, 'area', ${regionId}, ${by}) returning id`
  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by)
    values (${NAME}, 'sector', ${area.id}, ${regionId}, ${by}) returning id`
  // Deleted on its own earlier: neither the parent's delete nor its undo may touch it.
  const [separateSector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by, deleted_at)
    values (${NAME}, 'sector', ${area.id}, ${regionId}, ${by}, ${EARLIER.toISOString()}::timestamptz) returning id`
  const [block, separateBlock] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by, deleted_at)
    values (${NAME}, 0, ${sector.id}, ${regionId}, ${by}, null::timestamptz),
           (${NAME}, 1, ${sector.id}, ${regionId}, ${by}, ${EARLIER.toISOString()}::timestamptz) returning id`
  const [route, separateRoute, loneRoute] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, deleted_at)
    values (${NAME}, ${block.id}, ${regionId}, ${by}, null::timestamptz),
           (${NAME}, ${separateBlock.id}, ${regionId}, ${by}, ${EARLIER.toISOString()}::timestamptz),
           (${NAME}, ${block.id}, ${regionId}, ${by}, null::timestamptz) returning id`
  ids = {
    area: area.id,
    block: block.id,
    loneRoute: loneRoute.id,
    route: route.id,
    sector: sector.id,
    separateBlock: separateBlock.id,
    separateRoute: separateRoute.id,
    separateSector: separateSector.id,
  }
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId} and parent_fk is not null`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('stampDeletedAt', () => {
  const now = new Date('2026-06-01T12:00:00Z')

  it('stamps only rows still live, cascading areas, then blocks, then their routes', async () => {
    await stampDeletedAt(
      db,
      { areaIds: [ids.area, ids.sector, ids.separateSector], blockIds: [ids.block, ids.separateBlock] },
      now,
      null,
    )
    const was = EARLIER.toISOString()
    expect(await deletedAt()).toMatchObject({
      area: now.toISOString(),
      block: now.toISOString(),
      loneRoute: now.toISOString(),
      route: now.toISOString(),
      sector: now.toISOString(),
      separateBlock: was,
      separateRoute: was,
      separateSector: was,
    })
  })

  it('restores only rows carrying that stamp, leaving a separate delete deleted', async () => {
    await stampDeletedAt(
      db,
      { areaIds: [ids.area, ids.sector, ids.separateSector], blockIds: [ids.block, ids.separateBlock] },
      null,
      now,
    )
    expect(await deletedAt()).toMatchObject({
      area: null,
      block: null,
      route: null,
      sector: null,
      separateBlock: EARLIER.toISOString(),
      separateRoute: EARLIER.toISOString(),
      separateSector: EARLIER.toISOString(),
    })
  })

  it('stamps routes named by id alone, without touching their siblings', async () => {
    await stampDeletedAt(db, { routeIds: [ids.loneRoute] }, now, null)
    const after = await deletedAt()
    expect(after.loneRoute).toBe(now.toISOString())
    expect(after.route).toBeNull()
  })

  it('leaves a route already deleted alone when its id is stamped again', async () => {
    await stampDeletedAt(db, { routeIds: [ids.loneRoute] }, new Date('2026-07-01T00:00:00Z'), null)
    expect((await deletedAt()).loneRoute).toBe(now.toISOString())
  })
})
