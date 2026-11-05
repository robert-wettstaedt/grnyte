/**
 * `recomputeAreaChains` after a parent changes: every route under the moved area, however deep,
 * carries the new chain in both encodings. Skipped without DATABASE_URL.
 */
import * as schema from '$lib/db/schema'
import { reachable, seedRegion, sql } from '$lib/db/testDb'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recomputeAreaChains } from './area.server'

const db = drizzle(sql, { schema })
const NAME = '__recompute_area_chains__'

let regionId = 0
const ids = { from: 0, route: 0, sector: 0, sub: 0, to: 0 }

beforeAll(async () => {
  if (!reachable) return
  const seeded = await seedRegion(NAME)
  regionId = seeded.regionId
  const by = seeded.user.userId
  const [from, to] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values (${NAME}, 'area', ${regionId}, ${by}), (${NAME}, 'area', ${regionId}, ${by}) returning id`
  const [sub] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by)
    values (${NAME}, 'area', ${from.id}, ${regionId}, ${by}) returning id`
  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by)
    values (${NAME}, 'sector', ${sub.id}, ${regionId}, ${by}) returning id`
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values (${NAME}, 0, ${sector.id}, ${regionId}, ${by}) returning id`
  const chain = [from.id, sub.id, sector.id]
  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, area_fks, area_ids)
    values (${NAME}, ${block.id}, ${regionId}, ${by}, ${chain}, ${chain.map((id) => `^${id}$`).join(',')})
    returning id`
  Object.assign(ids, { from: from.id, route: route.id, sector: sector.id, sub: sub.id, to: to.id })
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.routes where region_fk = ${regionId}`
    await sql`delete from public.blocks where region_fk = ${regionId}`
    await sql`delete from public.areas where region_fk = ${regionId} and type = 'sector'`
    await sql`delete from public.areas where region_fk = ${regionId} and parent_fk is not null`
    await sql`delete from public.areas where region_fk = ${regionId}`
    await sql`delete from public.region_members where region_fk = ${regionId}`
    await sql`delete from public.regions where id = ${regionId}`
  }
  await sql.end()
})

describe.skipIf(!reachable)('recomputeAreaChains', () => {
  it('rewrites the chain of a route two areas below the moved one', async () => {
    await sql`update public.areas set parent_fk = ${ids.to} where id = ${ids.sub}`

    await recomputeAreaChains(db, [ids.sub])

    const [route] = await sql<{ areaFks: number[]; areaIds: string }[]>`
      select area_fks as "areaFks", area_ids as "areaIds" from public.routes where id = ${ids.route}`
    expect(route.areaFks).toEqual([ids.to, ids.sub, ids.sector])
    expect(route.areaIds).toBe(`^${ids.to}$,^${ids.sub}$,^${ids.sector}$`)
  })
})
