// @vitest-environment node
import * as schema from '$lib/db/schema'
import { connect } from '$lib/db/testAccounts'
import { reachable, seedUsers } from '$lib/db/testDb'
import { drizzle } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { applyOps } from './guidebookApply'
import { parseOps, type Op } from './guidebookPlan'
import { Preflight, type Tx } from './regionMove'

// Its own pool: drizzle swaps the client's serializers out, which breaks raw inserts on the shared `sql`.
const pool = connect()
afterAll(() => pool.end())
const ROLLBACK = new Error('rollback')

interface World {
  b1: number
  b2: number
  b3: number
  fa1: number
  fa2: number
  r1: number
  r2: number
  r3: number
  r4: number
  region: number
  root: number
  sector: number
  user: number
}

/** A small region inside `tx`: every row rolls back with it. */
async function world(tx: Tx): Promise<World> {
  const { user } = await seedUsers({ user: 'maintainer@grnyte.rocks' })
  const one = async (rows: Promise<{ id: number }[]>) => (await rows)[0].id
  const region = await one(tx`insert into regions (name, created_by, settings)
    values ('__guidebook_apply__', ${user.userId}, ${JSON.stringify({ tags: ['high', 'sit start'] })}::jsonb) returning id`)
  const area = (name: string, parent: null | number, type: null | string) =>
    one(tx`insert into areas (name, parent_fk, type, region_fk, created_by)
           values (${name}, ${parent}, ${type}, ${region}, ${user.userId}) returning id`)
  const root = await area('Tal', null, 'area')
  const sector = await area('Sektor', root, 'sector')
  const block = (name: string, order: number) =>
    one(tx`insert into blocks (name, area_fk, region_fk, created_by, "order")
           values (${name}, ${sector}, ${region}, ${user.userId}, ${order}) returning id`)
  const [b1, b2, b3] = [await block('Pilz', 0), await block('Turm', 1), await block('Pilz alt', 2)]
  // the merged block's pin: the survivor gets its own in the list, so this row must go, not dangle
  const geo = await one(tx`insert into geolocations (region_fk, block_fk, lat, long)
                           values (${region}, ${b3}, 49.1, 11.1) returning id`)
  await tx`update blocks set geolocation_fk = ${geo} where id = ${b3}`
  const grade6A = await one(tx`select id from grades where "FB" = 'FB 6A'`)
  const route = (name: string, b: number) =>
    one(tx`insert into routes (name, block_fk, region_fk, created_by, grade_fk, area_fks, area_ids)
           values (${name}, ${b}, ${region}, ${user.userId}, ${grade6A}, ${[root, sector]}::int[],
                   ${`^${root}$,^${sector}$`}) returning id`)
  const [r1, r2, r3, r4] = [
    await route('Kante', b1),
    await route('Kante', b1),
    await route('Riss', b2),
    await route('Dach', b3),
  ]
  const fa = (name: string) =>
    one(tx`insert into first_ascensionists (name, region_fk) values (${name}, ${region}) returning id`)
  const [fa1, fa2] = [await fa('a. fels'), await fa('A. Fels')]
  await tx`insert into routes_to_first_ascensionists (route_fk, first_ascensionist_fk, region_fk)
           values (${r1}, ${fa2}, ${region}), (${r2}, ${fa1}, ${region})`
  return { b1, b2, b3, fa1, fa2, r1, r2, r3, r4, region, root, sector, user: user.userId }
}

const list = (w: World, extra: Op[] = []) =>
  parseOps({
    fp: {},
    ops: [
      ...extra,
      { key: 'otto', name: 'Otto Neu', op: 'create_fa' },
      {
        description: null,
        key: 'a2:r9',
        name: 'Neuer Sektor',
        op: 'create_area',
        parent: { id: w.root },
        type: 'sector',
      },
      { id: w.sector, op: 'update_area', set: { name: { new: 'Sektor Süd', old: 'Sektor' } } },
      {
        area: { key: 'a2:r9' },
        description: 'Siehe !routes:new:r9!.',
        key: 'b:r9',
        name: 'Neublock',
        op: 'create_block',
        order: 0,
        point: { estimated: true, lat: 49.7, lng: 11.4 },
      },
      {
        id: w.b1,
        op: 'update_block',
        set: {
          name: { new: 'Pilzblock', old: 'Pilz' },
          point: { new: { estimated: false, lat: 49.8, lng: 11.5 }, old: null },
        },
      },
      {
        block: { key: 'b:r9' },
        description: `Wie !routes:${w.r1}!.`,
        first_ascent: [{ key: 'otto' }],
        first_ascent_year: 2020,
        grade: '7A',
        key: 'r9',
        name: 'Neu',
        op: 'create_route',
        rating: 2,
        tags: ['high'],
      },
      {
        add_tags: ['sit start'],
        id: w.r1,
        op: 'update_route',
        set: { first_ascent: { new: [{ id: w.fa2 }], old: ['A. Fels'] }, grade: { new: '7A', old: '6A' } },
      },
      { id: w.fa2, new: 'Anna Fels', old: 'A. Fels', op: 'rename_fa' },
      { gone: w.fa1, into: w.fa2, op: 'merge_fa' },
      { gone: w.r2, into: w.r1, op: 'merge_route' },
      { gone: w.b3, into: w.b1, op: 'merge_block' },
      { id: w.r3, op: 'delete_route' },
      { id: w.b2, op: 'delete_block' },
    ],
    refs: [
      { kind: 'route', ref: 'r9', target: { key: 'r9' } },
      { kind: 'block', ref: 'b:r1', target: { id: w.b1 } },
    ],
    source: 'Test-Buch-2026',
  })

/** Runs `body` in a transaction that always rolls back. */
async function inRollback(body: (tx: Tx, db: ReturnType<typeof drizzle<typeof schema>>) => Promise<void>) {
  await pool
    .begin(async (tx) => {
      await tx`set local search_path to public`
      const db = drizzle(Object.assign(tx, { options: pool.options }) as unknown as postgres.Sql, { schema })
      await body(tx, db)
      throw ROLLBACK
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e
    })
}

describe.skipIf(!reachable)('applyOps', () => {
  it('writes every operation kind and links rows it created by key', async () => {
    await inRollback(async (tx, db) => {
      const w = await world(tx)
      const preflight = new Preflight()
      const { events } = await applyOps(tx, db, list(w), {
        actor: w.user,
        batch: 'test-batch',
        preflight,
        region: w.region,
      })
      expect(preflight.failures).toEqual([])

      const [neu] = await tx<
        {
          area: number[]
          block: number
          desc: string
          fa: string[]
          fb: string
          id: number
          rating: number
          tags: string[]
        }[]
      >`
        select r.id, r.block_fk as block, r.area_fks as area, r.rating, g."FB" as fb, r.description as desc,
          array(select f.name from routes_to_first_ascensionists t join first_ascensionists f
                on f.id = t.first_ascensionist_fk where t.route_fk = r.id) as fa,
          array(select tag_fk from routes_to_tags where route_fk = r.id) as tags
        from routes r join grades g on g.id = r.grade_fk where r.region_fk = ${w.region} and r.name = 'Neu'`
      expect([neu.fb, neu.rating, neu.fa, neu.tags, neu.desc]).toEqual([
        'FB 7A',
        2,
        ['Otto Neu'],
        ['high'],
        `Wie !routes:${w.r1}!.`,
      ])
      const [block] = await tx<{ area: number; desc: string; est: boolean; type: string }[]>`
        select b.area_fk as area, b.description as desc, g.estimated as est, a.type
        from blocks b join geolocations g on g.id = b.geolocation_fk join areas a on a.id = b.area_fk where b.id = ${neu.block}`
      expect(block).toEqual({ area: neu.area[1], desc: `Siehe !routes:${neu.id}!.`, est: true, type: 'sector' })
      expect(neu.area[0]).toBe(w.root)

      const [r1] = await tx<{ fa: string[]; fb: string; tags: string[] }[]>`
        select g."FB" as fb,
          array(select f.name from routes_to_first_ascensionists t join first_ascensionists f
                on f.id = t.first_ascensionist_fk where t.route_fk = r.id) as fa,
          array(select tag_fk from routes_to_tags where route_fk = r.id order by tag_fk) as tags
        from routes r join grades g on g.id = r.grade_fk where r.id = ${w.r1}`
      expect(r1).toEqual({ fa: ['Anna Fels'], fb: 'FB 7A', tags: ['sit start'] })
      const gone =
        await tx`select 1 from routes where id = ${w.r2} union all select 1 from first_ascensionists where id = ${w.fa1}`
      expect(gone).toHaveLength(0)
      const [moved] = await tx<{ block: number }[]>`select block_fk as block from routes where id = ${w.r4}`
      expect(moved.block).toBe(w.b1)
      const deleted = await tx<{ id: number }[]>`
        select id from routes where id = ${w.r3} and deleted_at is not null
        union all select id from blocks where id in (${w.b2}, ${w.b3}) and deleted_at is not null`
      expect(deleted.map((d) => d.id).sort()).toEqual([w.r3, w.b2, w.b3].sort())
      const [pin] = await tx<{ lat: number }[]>`
        select g.lat from blocks b join geolocations g on g.id = b.geolocation_fk where b.id = ${w.b1}`
      expect(pin.lat).toBe(49.8)
      const pins = await tx`select 1 from geolocations where block_fk in (${w.b1}, ${w.b3})`
      expect(pins).toHaveLength(1) // the merged block's own pin went with it

      const heads = await tx<
        { size: number }[]
      >`select batch_size as size from events where batch = 'test-batch' and batch_size is not null`
      expect(heads).toEqual([{ size: events }])
      const refs = await tx<{ ref: string }[]>`select ref from import_refs where source = 'Test-Buch-2026' order by ref`
      expect(refs.map((r) => r.ref)).toEqual(['b:r1', 'r9'])
    })
  })

  it('refuses a stale snapshot before writing anything', async () => {
    await inRollback(async (tx, db) => {
      const w = await world(tx)
      await tx`update routes set name = 'Kante (umbenannt)' where id = ${w.r1}`
      const preflight = new Preflight()
      const stale: Op = { id: w.r1, op: 'update_route', set: { name: { new: 'Kante direkt', old: 'Kante' } } }
      await expect(
        applyOps(tx, db, list(w, [stale]), { actor: w.user, batch: 'stale', preflight, region: w.region }),
      ).rejects.toBeDefined()
      expect(preflight.failures).toEqual([`route ${w.r1} name changed since the snapshot`])
      const written = await tx`select 1 from first_ascensionists where name = 'Otto Neu' and region_fk = ${w.region}`
      expect(written).toHaveLength(0)
    })
  })

  it('refuses a list built for another region', async () => {
    await inRollback(async (tx, db) => {
      const w = await world(tx)
      const preflight = new Preflight()
      const other = { ...list(w), region: w.region + 1 }
      await expect(
        applyOps(tx, db, other, { actor: w.user, batch: 'region', preflight, region: w.region }),
      ).rejects.toBeDefined()
      expect(preflight.failures).toEqual([`the list was built for region ${w.region + 1}`])
    })
  })

  it('refuses a merge into itself and a re-parent onto a row outside the region', async () => {
    await inRollback(async (tx, db) => {
      const w = await world(tx)
      const foreign = 2_000_000_000 // no such area
      const ops = parseOps({
        fp: {},
        ops: [
          { id: w.sector, op: 'update_area', set: { parent: { new: { id: foreign }, old: { id: w.root } } } },
          { gone: w.r1, into: w.r1, op: 'merge_route' },
          { gone: w.b3, into: w.b1, op: 'merge_block' },
          { id: w.b3, op: 'delete_block' },
        ],
        refs: [],
        source: 'Test-Buch-2026',
      })
      const preflight = new Preflight()
      await expect(
        applyOps(tx, db, ops, { actor: w.user, batch: 'refused', preflight, region: w.region }),
      ).rejects.toBeDefined()
      expect(preflight.failures).toEqual(
        expect.arrayContaining([
          `area ${foreign} does not exist`,
          `merge_route merges ${w.r1} into itself`,
          `block ${w.b3} is used after an earlier op removed it`,
        ]),
      )
    })
  })

  it('fails a run whose re-parenting makes a cycle instead of hanging', async () => {
    await inRollback(async (tx, db) => {
      const w = await world(tx)
      const cycle: Op = { id: w.root, op: 'update_area', set: { parent: { new: { id: w.sector }, old: { id: null } } } }
      const ops = parseOps({ fp: {}, ops: [cycle], refs: [], source: 'Test-Buch-2026' })
      await expect(
        applyOps(tx, db, ops, { actor: w.user, batch: 'cycle', preflight: new Preflight(), region: w.region }),
      ).rejects.toThrow(/area chain that is not root to block/)
    })
  })

  it('fails the run when it empties a block the list does not delete', async () => {
    await inRollback(async (tx, db) => {
      const w = await world(tx)
      const ops = parseOps({ fp: {}, ops: [{ id: w.r3, op: 'delete_route' }], refs: [], source: 'Test-Buch-2026' })
      await expect(
        applyOps(tx, db, ops, { actor: w.user, batch: 'empty', preflight: new Preflight(), region: w.region }),
      ).rejects.toThrow(new RegExp(`blocks emptied by the run but not deleted by the list: ${w.b2}`))
    })
  })
})
