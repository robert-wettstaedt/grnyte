// @vitest-environment node
import * as schema from '$lib/db/schema'
import { connect } from '$lib/db/testAccounts'
import { reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { drizzle } from 'drizzle-orm/postgres-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importRefsOf, recordImportRefs } from './importRefs.server'

// Its own pool: drizzle swaps the client's serializers out, which breaks the raw json inserts on `sql`.
const pool = connect()
const db = drizzle(pool, { schema })

const REGION = '__import_refs_test__'

let regionId = 0
let maintainer: SeedUser
let area = 0
let block = 0
let route = 0
let otherRoute = 0

async function removeFixtures() {
  const ids = sql`select id from public.regions where name = ${REGION}`
  await sql`delete from public.import_refs where region_fk in (${ids})`
  await sql`delete from public.routes where region_fk in (${ids})`
  await sql`delete from public.blocks where region_fk in (${ids})`
  await sql`delete from public.areas where region_fk in (${ids})`
  await sql`delete from public.region_members where region_fk in (${ids})`
  await sql`delete from public.regions where name = ${REGION}`
}

beforeAll(async () => {
  if (!reachable) return

  await removeFixtures()
  ;({ regionId, user: maintainer } = await seedRegion(REGION))
  ;[{ id: area }] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__import_refs_area__', 'sector', ${regionId}, ${maintainer.userId}) returning id`
  ;[{ id: block }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__import_refs_block__', ${area}, ${regionId}, ${maintainer.userId}, 0) returning id`
  ;[{ id: route }] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__import_refs_route__', ${block}, ${regionId}, ${maintainer.userId}) returning id`
  ;[{ id: otherRoute }] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__import_refs_other_route__', ${block}, ${regionId}, ${maintainer.userId}) returning id`
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await Promise.all([sql.end(), pool.end()])
})

const ROLLBACK = Symbol('rollback')
async function insertRaw(rows: Record<string, unknown>[]) {
  try {
    await sql.begin(async (tx) => {
      for (const row of rows) {
        await tx`insert into public.import_refs ${tx({ imported: {}, region_fk: regionId, ...row })}`
      }
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

describe.skipIf(!reachable)('import_refs', () => {
  it('refuses a ref pointing at two entities', async () => {
    await expect(insertRaw([{ block_fk: block, ref: 'y1-100', route_fk: route, source: 's' }])).rejects.toThrow(
      /import_refs_one_target/,
    )
  })

  it('refuses a ref pointing at nothing', async () => {
    await expect(insertRaw([{ ref: 'y1-100', source: 's' }])).rejects.toThrow(/import_refs_one_target/)
  })

  it('refuses an empty source or line', async () => {
    await expect(insertRaw([{ ref: 'y1-100', route_fk: route, source: '' }])).rejects.toThrow(/import_refs_named/)
    await expect(insertRaw([{ ref: '', route_fk: route, source: 's' }])).rejects.toThrow(/import_refs_named/)
  })

  it('refuses one line of one source pointing at a second route', async () => {
    await expect(
      insertRaw([
        { ref: 'y1-100', route_fk: route, source: 's' },
        { ref: 'y1-100', route_fk: otherRoute, source: 's' },
      ]),
    ).rejects.toThrow(/import_refs_route_line/)
  })

  it('takes a block and its route on one printed line, and one entity on two lines', async () => {
    await expect(
      insertRaw([
        { block_fk: block, ref: 'y1-100', source: 's' },
        { ref: 'y1-100', route_fk: route, source: 's' },
        { area_fk: area, ref: 'y1-50', source: 's' },
        { area_fk: area, ref: 'y9-50', source: 's' },
      ]),
    ).resolves.toBeUndefined()
  })
})

describe.skipIf(!reachable)('recordImportRefs and importRefsOf', () => {
  it('keeps what the import wrote beside each line, under the region of the entity', async () => {
    const refs = [
      { id: route, imported: { grade: '7A', name: 'Kante' }, kind: 'route', ref: 'y12-300' },
      { id: area, imported: { name: 'Ostwand' }, kind: 'area', ref: 'y11-40' },
    ] as const
    await recordImportRefs(db, 'edition-a', regionId, refs)

    expect(await importRefsOf(db, 'edition-a', regionId)).toEqual(expect.arrayContaining([...refs]))
    expect(await importRefsOf(db, 'edition-a', regionId + 1_000_000)).toEqual([])
  })

  it('adds a second edition beside the first and leaves the first alone', async () => {
    await recordImportRefs(db, 'edition-b-2026', regionId, [
      { id: route, imported: { name: 'Kante' }, kind: 'route', ref: 'y12-300' },
    ])
    await recordImportRefs(db, 'edition-b-2030', regionId, [
      { id: route, imported: { name: 'Kante direkt' }, kind: 'route', ref: 'y40-120' },
    ])

    expect(await importRefsOf(db, 'edition-b-2026', regionId)).toEqual([
      { id: route, imported: { name: 'Kante' }, kind: 'route', ref: 'y12-300' },
    ])
    expect(await importRefsOf(db, 'edition-b-2030', regionId)).toEqual([
      { id: route, imported: { name: 'Kante direkt' }, kind: 'route', ref: 'y40-120' },
    ])
  })

  it('refuses an id that names no entity rather than dropping it', async () => {
    await expect(
      recordImportRefs(db, 'edition-c', regionId, [{ id: 2_000_000_000, imported: {}, kind: 'route', ref: 'y1-1' }]),
    ).rejects.toThrow()
    expect(await importRefsOf(db, 'edition-c', regionId)).toEqual([])
  })

  it('refuses an entity of another region, so the region it reads back by is the one it wrote', async () => {
    await expect(
      recordImportRefs(db, 'edition-f', regionId + 1_000_000, [
        { id: route, imported: {}, kind: 'route', ref: 'y5-5' },
      ]),
    ).rejects.toThrow(/no entity in region/)
  })

  it('still reads the ref of a soft-deleted entity, and drops it with a hard delete', async () => {
    const [{ id: gone }] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__import_refs_gone__', ${block}, ${regionId}, ${maintainer.userId}) returning id`
    await recordImportRefs(db, 'edition-d', regionId, [{ id: gone, imported: {}, kind: 'route', ref: 'y2-2' }])

    await sql`update public.routes set deleted_at = now() where id = ${gone}`
    expect((await importRefsOf(db, 'edition-d', regionId)).map((ref) => ref.id)).toEqual([gone])

    await sql`delete from public.routes where id = ${gone}`
    expect(await importRefsOf(db, 'edition-d', regionId)).toEqual([])
  })

  it('shows a region member no ref at all', async () => {
    await recordImportRefs(db, 'edition-e', regionId, [{ id: block, imported: {}, kind: 'block', ref: 'y3-3' }])
    const claims = JSON.stringify({ email: maintainer.email, role: 'authenticated', sub: maintainer.authId })

    const seen = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${claims}, true)`
      await tx.unsafe('set local role app_writer')
      return tx`select id from public.import_refs where region_fk = ${regionId}`
    })

    expect(seen).toHaveLength(0)
  })
})
