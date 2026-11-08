import { PowerSyncDatabase } from '@powersync/node'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changedRows } from './rows'
import { appSchema } from './schema'
import * as statements from './sql'

// The tables a phone holds thousands of rows of: a scan of one of them is a frozen screen, not a slow query.
const LARGE = /\bSCAN\b.*\b(?:ps_data__)?(?:areas|ascents|blocks|routes)\b/

let dir: string
let db: PowerSyncDatabase

beforeAll(async () => {
  // A real PowerSync file: the views every statement reads through exist only once the SDK has opened it.
  dir = mkdtempSync(join(tmpdir(), 'grnyte-explain-'))
  db = new PowerSyncDatabase({
    database: { dbFilename: 'explain.sqlite', dbLocation: dir, implementation: { type: 'node:sqlite' } },
    schema: appSchema,
  })
  await db.waitForReady()
})

afterAll(async () => {
  await db?.close()
  rmSync(dir, { force: true, recursive: true })
})

/** The plan's steps after the driving one: a statement may read its first table whole, never one it joins or looks up. */
const innerSteps = async (sql: string) =>
  (await db.getAll<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)).slice(1).map((row) => row.detail)

describe('every raw statement joins through an index', () => {
  it.each(Object.entries(statements))('%s scans no large table it joins', async (_, sql) => {
    expect((await innerSteps(sql)).filter((step) => LARGE.test(step))).toEqual([])
  })
})

describe('a watched statement', () => {
  it('answers an empty first result, so an empty list leaves its skeleton', async () => {
    const watched = db.query({ sql: 'select nid from routes where nid = -1' }).watch({ comparator: changedRows() })
    const first = new Promise<unknown>((resolve) => watched.registerListener({ onData: (rows) => resolve([...rows]) }))
    const timeout = new Promise((resolve) => setTimeout(() => resolve('never answered'), 2000))

    expect(await Promise.race([first, timeout])).toEqual([])
    await watched.close()
  })
})

describe('the route statements', () => {
  // Off, as `filterParameters` binds an unset filter.
  const off = Array<unknown>(9).fill(null)
  const ids = async (sql: string, parameters: unknown[]) =>
    (await db.getAll<{ id?: number; nid?: number }>(sql, parameters)).map((row) => row.nid ?? row.id)

  beforeAll(async () => {
    await db.execute(`insert into areas (id, nid, name) values ('5', 5, 'Sector')`)
    await db.execute(`insert into blocks (id, nid, name, "order", area_fk) values ('40', 40, 'Boulder', 2, 5)`)
    for (const [nid, grade, rating] of [
      [1, 10, 1],
      [2, 12, 3],
      [3, 14, 2],
    ]) {
      await db.execute(
        `insert into routes (id, nid, name, block_fk, region_fk, area_ids, user_grade_fk, user_rating)
          values (?, ?, ?, 40, 18, '^5$', ?, ?)`,
        [String(nid), nid, `Route ${nid}`, grade, rating],
      )
    }
    await db.execute(`insert into routes_to_tags (id, route_fk, tag_fk) values ('1-crimpy', 1, 'crimpy')`)
    await db.execute(`insert into first_ascensionists (id, nid, name, user_fk) values ('7', 7, 'Ada', 3)`)
    await db.execute(`insert into routes_to_first_ascensionists (id, nid, route_fk, first_ascensionist_fk)
      values ('8', 8, 2, 7)`)
    await db.execute(`insert into files (id, path, width, height) values ('f1', 't/1', 600, 800)`)
    await db.execute(`insert into topos (id, nid, block_fk, file_fk) values ('9', 9, 40, 'f1')`)
    await db.execute(`insert into topo_routes (id, nid, route_fk, topo_fk, path) values ('30', 30, 3, 9, 'M0,0')`)
    await db.execute(`insert into files (id, route_fk, bunny_stream_fk) values ('v1', 1, 's1')`)
    await db.execute(`insert into ascents (id, nid, route_fk) values ('50', 50, 2)`)
    await db.execute(`insert into files (id, ascent_fk, bunny_stream_fk) values ('v2', 50, 's2')`)
  })

  it('filter as listRoutes did, each off when null', async () => {
    const list = (at: number, value: unknown) => ids(statements.ROUTE_MAP_SQL, off.with(at, value))
    expect(await ids(statements.ROUTE_MAP_SQL, off)).toEqual([1, 2, 3])
    expect(await list(0, 19)).toEqual([])
    expect(await list(1, '^5$')).toEqual([1, 2, 3])
    expect(await list(1, '^55$')).toEqual([])
    expect(await list(2, 12)).toEqual([2, 3])
    expect(await list(3, 12)).toEqual([1, 2])
    expect(await list(4, 2)).toEqual([2, 3])
    expect(await list(5, '["crimpy","roof"]')).toEqual([1])
    expect(await list(6, '[7]')).toEqual([2])
    expect(await list(7, 1)).toEqual([3])
    expect(await list(8, 1)).toEqual([1, 2])
  })

  it('hand the map its blocks and areas with their parents, pin and parking', async () => {
    await db.execute(`insert into areas (id, nid, name, type) values ('2', 2, 'Forest', 'area')`)
    await db.execute(`update areas set parent_fk = 2, type = 'sector' where nid = 5`)
    await db.execute(
      `insert into geolocations (id, nid, lat, long, estimated, block_fk) values ('6', 6, 47.5, 11.1, 1, 40)`,
    )
    await db.execute(
      `insert into geolocations (id, nid, lat, long, estimated, area_fk) values ('7', 7, 47.6, 11.2, 0, 5)`,
    )
    await db.execute(`update blocks set geolocation_fk = 6 where nid = 40`)

    const [block] = await db.getAll<Record<string, string>>(statements.MAP_SQL)
    expect([JSON.parse(block!.area), JSON.parse(block!.geolocation)]).toEqual([
      { id: 5, name: 'Sector', parent: { id: 2, name: 'Forest', type: 'area' }, type: 'sector' },
      { estimated: 1, lat: 47.5, long: 11.1, nid: 6 },
    ])
    // Unordered: the resource sorts names in JS.
    const areas = (await db.getAll<Record<string, string>>(statements.AREA_MAP_SQL)).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )
    expect(areas.map((area) => [area.name, JSON.parse(area.parent), JSON.parse(area.parking)])).toEqual([
      ['Forest', null, []],
      [
        'Sector',
        { id: 2, name: 'Forest', parent: null, type: 'area' },
        [{ area_fk: 5, block_fk: null, estimated: 0, lat: 47.6, long: 11.2, nid: 7, region_fk: null }],
      ],
    ])
  })

  it('hand back the related rows as Zero nested them', async () => {
    const [two, three] = await db.getAll<Record<string, string>>(statements.ROUTES_BY_ID_SQL, ['[3,2]'])
    expect(JSON.parse(two!.first_ascents)).toEqual([{ firstAscensionist: { name: 'Ada', userFk: 3 } }])
    expect(JSON.parse(two!.block)).toEqual({ area: { name: 'Sector' }, name: 'Boulder', order: 2 })
    expect(JSON.parse(three!.topo_routes)).toEqual([
      { path: 'M0,0', topo: { file: { height: 800, path: 't/1', width: 600 } } },
    ])
    expect(JSON.parse(three!.tags)).toEqual([])
  })
})
