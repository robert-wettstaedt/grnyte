/**
 * The two hard-restore paths, driven for real.
 *
 * `restoreArea` and `restoreBlock` rebuild a row from a snapshot that went out to the client and
 * came back, so every column they write is a column a request states. What these tests pin down is
 * which of those columns the server derives anyway: authorship, region, placement, and an area's
 * `type`, which `refreshAreaType` owns and no request may name.
 *
 * The caller is a maintainer in BOTH regions on purpose, the same setup `areas.remote.test.ts`
 * uses: an escalation has to be the handler's own doing, not something the region gate would have
 * refused anyway.
 *
 * Commands, unlike forms, are dispatched through Kit's wrapper, which is why `asRequest` carries a
 * POST request and a `handleValidationError` (see `testHarness.ts`).
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { restoreArea } from '$lib/entities/area/areas.remote'
import { restoreBlock } from '$lib/entities/block/blocks.remote'
import { restoreRoute } from '$lib/entities/route/routes.remote'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HOME = '__restore_home__'
const OTHER = '__restore_other__'

/** Ids the sequence issued that no row holds, like a hard-deleted row's: drawn with `nextval`, so
 *  parallel suites never get them, and a restore under an id never issued is refused. */
const deadIds: Record<'areas' | 'blocks' | 'routes', number[]> = { areas: [], blocks: [], routes: [] }
const deadId = (entity: keyof typeof deadIds) => {
  const id = deadIds[entity].shift()
  if (id == null) throw new Error(`no dead ${entity} id left`)
  return id
}

let maintainer: SeedUser
let homeRegionId = 0
let otherRegionId = 0
let parentAreaId = 0
let sectorAreaId = 0

async function createArea(name: string, regionId: number, type: 'area' | 'sector'): Promise<number> {
  const [area] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values (${name}, ${type}, ${regionId}, ${maintainer.userId}) returning id`

  return area.id
}

async function createBlock(name: string, areaId: number, regionId: number): Promise<number> {
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values (${name}, 0, ${areaId}, ${regionId}, ${maintainer.userId}) returning id`

  return block.id
}

async function createFirstAscensionist(name: string, regionId: number): Promise<number> {
  const [climber] = await sql<{ id: number }[]>`
    insert into public.first_ascensionists (name, region_fk) values (${name}, ${regionId}) returning id`

  return climber.id
}

async function createRegion(name: string): Promise<number> {
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${name}, ${maintainer.userId}) returning id`

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${region.id}, ${maintainer.userId}, ${maintainer.authId}, 'region_maintainer', true)`

  return region.id
}

beforeAll(async () => {
  if (!reachable) return

  for (const entity of ['areas', 'blocks', 'routes'] as const) {
    const rows = await sql<{ id: number }[]>`
      select nextval(pg_get_serial_sequence(${`public.${entity}`}, 'id'))::int as id from generate_series(1, 10)`
    deadIds[entity] = rows.map((row) => row.id)
  }

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer

  homeRegionId = await createRegion(HOME)
  otherRegionId = await createRegion(OTHER)

  // `canAddArea` wants a parent that is untyped or an 'area'; `canAddBlock` wants a 'sector'.
  parentAreaId = await createArea('__restore_parent__', homeRegionId, 'area')
  sectorAreaId = await createArea('__restore_crag__', homeRegionId, 'sector')
})

afterAll(async () => {
  if (reachable) {
    // Order matters. `events` carries a region FK (its `changes` and `reactions` cascade off it),
    // and a block points at its geolocation while that geolocation points back at the block, so the
    // link has to be broken before either row can go. Areas go in one statement: FK triggers fire at
    // the end of it, so a parent and its child disappearing together is not a violation.
    await sql`delete from public.events where region_fk in (${homeRegionId}, ${otherRegionId})`
    // The route side goes before the blocks it hangs off: the junction first, because it points at
    // both a route and a climber, then the two tables it points at.
    await sql`delete from public.routes_to_first_ascensionists where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.routes where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.first_ascensionists where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`update public.blocks set geolocation_fk = null where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.geolocations where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.blocks where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.areas where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.region_members where region_fk in (${homeRegionId}, ${otherRegionId})`
    await sql`delete from public.regions where id in (${homeRegionId}, ${otherRegionId})`
  }
  await sql.end()
})

describe.skipIf(!reachable)('restoreArea (hard)', () => {
  it('rebuilds the area from the snapshot and stamps the caller as its author', async () => {
    await asRequest(maintainer.authId, () =>
      restoreArea({
        area: {
          description: '__restore_description__',
          geoPaths: ['__restore_path__'],
          name: '__restore_area__',
          parentFk: parentAreaId,
          regionFk: homeRegionId,
          walkingPaths: ['__restore_walk__'],
        },
        areaId: deadId('areas'),
        mode: 'hard',
        parking: [{ lat: 47.1, long: 8.2 }],
      }),
    )

    const [row] = await sql<
      {
        createdBy: number
        description: null | string
        geoPaths: null | string[]
        id: number
        parentFk: null | number
        regionFk: number
        type: null | string
        walkingPaths: null | string[]
      }[]
    >`
      select created_by as "createdBy", description, geo_paths as "geoPaths", id,
             parent_fk as "parentFk", region_fk as "regionFk", type, walking_paths as "walkingPaths"
      from public.areas where name = '__restore_area__'`

    // Every column the explicit list writes, so dropping one from it fails here rather than
    // silently losing an area's description or its approach paths on undo.
    expect(row).toMatchObject({
      createdBy: maintainer.userId,
      description: '__restore_description__',
      geoPaths: ['__restore_path__'],
      parentFk: parentAreaId,
      regionFk: homeRegionId,
      type: null,
      walkingPaths: ['__restore_walk__'],
    })

    const parking = await sql<{ lat: number }[]>`
      select lat from public.geolocations where area_fk = ${row.id}`
    expect(parking).toHaveLength(1)
  })

  it('derives the area type instead of taking it from the snapshot', async () => {
    // The cast is the point: a request body is not TypeScript. The restore schema carries no `type`,
    // so this is the shape a hostile client sends rather than one a caller could write inline.
    const snapshot = {
      area: { name: '__restore_typed_area__', parentFk: null, regionFk: homeRegionId, type: 'sector' },
      areaId: deadId('areas'),
      mode: 'hard',
      parking: [],
    } as unknown as Parameters<typeof restoreArea>[0]

    await asRequest(maintainer.authId, () => restoreArea(snapshot))

    const [row] = await sql<{ type: null | string }[]>`
      select type from public.areas where name = '__restore_typed_area__'`

    // `refreshAreaType` owns this column, and the gate this restore ran (`canAddArea`) refuses
    // 'sector' outright, so a snapshot must not be able to mint through undo what create rejects: a
    // sector with no blocks, which `canAddParking` then accepts.
    expect(row.type).toBeNull()
  })

  it('refuses a parking pin that is not on the globe, and creates nothing', async () => {
    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreArea({
          area: { name: '__restore_offglobe_area__', parentFk: null, regionFk: homeRegionId },
          areaId: deadId('areas'),
          mode: 'hard',
          parking: [{ lat: 999, long: 8.2 }],
        }),
      ),
    )

    expect(status).toBe(400)

    const rows = await sql<{ id: number }[]>`
      select id from public.areas where name = '__restore_offglobe_area__'`
    expect(rows).toHaveLength(0)
  })
})

describe.skipIf(!reachable)('restoreBlock (hard)', () => {
  it("rebuilds the block on the stored area, with that area's region", async () => {
    await asRequest(maintainer.authId, () =>
      restoreBlock({
        areaFk: sectorAreaId,
        block: { description: 'Flat landing.', name: '__restore_block__', order: 0, regionFk: homeRegionId },
        blockId: deadId('blocks'),
        geolocation: { estimated: true, lat: 47.3, long: 8.4 },
        mode: 'hard',
      }),
    )

    const [row] = await sql<
      {
        areaFk: number
        createdBy: number
        description: null | string
        estimated: boolean
        geoAreaFk: null | number
        geoRegionFk: number
        lat: number
        order: number
        regionFk: number
      }[]
    >`
      select b.area_fk as "areaFk", b.created_by as "createdBy", b.description, b."order" as "order",
             b.region_fk as "regionFk", g.area_fk as "geoAreaFk", g.estimated,
             g.lat, g.region_fk as "geoRegionFk"
      from public.blocks b
      join public.geolocations g on g.id = b.geolocation_fk
      where b.name = '__restore_block__'`

    expect(row).toMatchObject({
      areaFk: sectorAreaId,
      createdBy: maintainer.userId,
      description: 'Flat landing.',
      estimated: true,
      // Null, because a geolocation carrying an `areaFk` is a parking, and removing a parking takes
      // region DELETE while this pin belongs to a block any EDITor may move.
      geoAreaFk: null,
      geoRegionFk: homeRegionId,
      lat: 47.3,
      order: 0,
      regionFk: homeRegionId,
    })
  })

  it("refuses a snapshot claiming a region other than the target area's", async () => {
    // The caller holds EDIT in both regions, so nothing but this handler stands between the two.
    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreBlock({
          areaFk: sectorAreaId,
          block: { description: null, name: '__restore_foreign_block__', order: 0, regionFk: otherRegionId },
          blockId: deadId('blocks'),
          geolocation: null,
          mode: 'hard',
        }),
      ),
    )

    expect(status).toBe(403)

    const rows = await sql<{ id: number }[]>`
      select id from public.blocks where name = '__restore_foreign_block__'`
    expect(rows).toHaveLength(0)
  })

  it('refuses a pin that is not on the globe, and creates nothing', async () => {
    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreBlock({
          areaFk: sectorAreaId,
          block: { description: null, name: '__restore_offglobe_block__', order: 0, regionFk: homeRegionId },
          blockId: deadId('blocks'),
          geolocation: { estimated: false, lat: 999, long: 8.4 },
          mode: 'hard',
        }),
      ),
    )

    expect(status).toBe(400)

    const rows = await sql<{ id: number }[]>`
      select id from public.blocks where name = '__restore_offglobe_block__'`
    expect(rows).toHaveLength(0)
  })
})

describe.skipIf(!reachable)('restoreRoute (hard)', () => {
  /** The snapshot minus the two fields each test is about, so a case states only its own point. */
  const snapshotFor = (blockId: number, name: string) => ({
    areaFks: null,
    areaIds: null,
    blockFk: blockId,
    createdBy: 0,
    description: null,
    firstAscentYear: null,
    gradeFk: null,
    name,
    rating: null,
    regionFk: homeRegionId,
  })

  it('refuses a rating the form would not accept, and creates nothing', async () => {
    const blockId = await createBlock('__restore_rating_block__', sectorAreaId, homeRegionId)

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreRoute({
          firstAscensionistFks: [],
          mode: 'hard',
          route: { ...snapshotFor(blockId, '__restore_rating_route__'), rating: 42 },
          routeId: deadId('routes'),
          tags: [],
        }),
      ),
    )

    // 400 from the schema, not a stored 42. `rating` feeds `recalcUserGradeAndRating`, so an
    // out-of-range one does not sit quietly in its own column: it becomes the route's rating.
    expect(status).toBe(400)

    const rows = await sql<{ id: number }[]>`
      select id from public.routes where name = '__restore_rating_route__'`
    expect(rows).toHaveLength(0)
  })

  it('refuses a first ascent year outside the range the form allows', async () => {
    const blockId = await createBlock('__restore_year_block__', sectorAreaId, homeRegionId)

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreRoute({
          firstAscensionistFks: [],
          mode: 'hard',
          route: { ...snapshotFor(blockId, '__restore_year_route__'), firstAscentYear: -500 },
          routeId: deadId('routes'),
          tags: [],
        }),
      ),
    )

    expect(status).toBe(400)

    const rows = await sql<{ id: number }[]>`
      select id from public.routes where name = '__restore_year_route__'`
    expect(rows).toHaveLength(0)
  })

  it('refuses an id the sequence never issued, which would be taken from every later insert', async () => {
    const blockId = await createBlock('__restore_unissued_block__', sectorAreaId, homeRegionId)
    const [{ ahead }] = await sql<{ ahead: number }[]>`
      select (pg_sequence_last_value(pg_get_serial_sequence('public.routes', 'id')) + 1000)::int as ahead`

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreRoute({
          firstAscensionistFks: [],
          mode: 'hard',
          route: snapshotFor(blockId, '__restore_unissued_route__'),
          routeId: ahead,
          tags: [],
        }),
      ),
    )

    expect(status).toBe(404)
    expect(await sql`select 1 from public.routes where id = ${ahead}`).toHaveLength(0)
  })

  it('refuses an id that holds another entity rather than confirming it exists', async () => {
    const blockId = await createBlock('__restore_taken_block__', sectorAreaId, homeRegionId)
    const elsewhere = await createBlock('__restore_taken_other__', sectorAreaId, homeRegionId)
    const [{ id: takenId }] = await sql<{ id: number }[]>`
      insert into public.routes (name, block_fk, region_fk, created_by)
      values ('__restore_taken_route__', ${elsewhere}, ${homeRegionId}, ${maintainer.userId}) returning id`

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreRoute({
          firstAscensionistFks: [],
          mode: 'hard',
          route: snapshotFor(blockId, '__restore_taken_replay__'),
          routeId: takenId,
          tags: [],
        }),
      ),
    )

    expect(status).toBe(404)
  })

  it("drops a first ascensionist belonging to a region other than the route's", async () => {
    const blockId = await createBlock('__restore_fa_block__', sectorAreaId, homeRegionId)
    const foreign = await createFirstAscensionist('__restore_foreign_fa__', otherRegionId)
    const own = await createFirstAscensionist('__restore_own_fa__', homeRegionId)

    await asRequest(maintainer.authId, () =>
      restoreRoute({
        firstAscensionistFks: [own, foreign],
        mode: 'hard',
        route: snapshotFor(blockId, '__restore_fa_route__'),
        routeId: deadId('routes'),
        tags: [],
      }),
    )

    // The route is created either way: the foreign id is dropped, not treated as a refusal, which
    // matches how the tag path handles a value the region no longer knows.
    const links = await sql<{ first_ascensionist_fk: number }[]>`
      select j.first_ascensionist_fk
      from public.routes_to_first_ascensionists j
      join public.routes r on r.id = j.route_fk
      where r.name = '__restore_fa_route__'`

    // Nothing pointing into the other region. The junction's WITH CHECK only tests its own
    // region_fk and the foreign key's referential check does not run under RLS, so the database
    // would have stored this link without complaint.
    expect(links.map((link) => link.first_ascensionist_fk)).toEqual([own])
  })

  /**
   * The columns `restoreRoute` derives rather than takes: the snapshot schema no longer has them,
   * so forged values are stripped on parse, and this pins that authorship and the area chain come
   * from the session and `areaAncestry(block.areaFk)`. `restoreFidelity` excludes these columns.
   */
  it('stamps the caller as author and recomputes the area chain from the stored block', async () => {
    const blockId = await createBlock('__restore_derive_block__', sectorAreaId, homeRegionId)

    await asRequest(maintainer.authId, () =>
      restoreRoute({
        firstAscensionistFks: [],
        mode: 'hard',
        // `snapshotFor` forges `createdBy: 0` and leaves `areaFks`/`areaIds` null, so none of the
        // values below can have come from the snapshot.
        route: snapshotFor(blockId, '__restore_derive_route__'),
        routeId: deadId('routes'),
        tags: [],
      }),
    )

    const [row] = await sql<{ areaFks: number[]; areaIds: string; createdBy: number; regionFk: number }[]>`
      select created_by as "createdBy", region_fk as "regionFk", area_fks as "areaFks", area_ids as "areaIds"
      from public.routes where name = '__restore_derive_route__'`

    expect(row).toEqual({
      areaFks: [sectorAreaId],
      areaIds: `^${sectorAreaId}$`,
      createdBy: maintainer.userId,
      regionFk: homeRegionId,
    })
  })
})

describe.skipIf(!reachable)('a replayed hard Undo', () => {
  const count = async (table: 'areas' | 'blocks' | 'routes', id: number) =>
    (await sql`select id from ${sql(`public.${table}`)} where id = ${id}`).length

  it('restores an area once when two Undos race', async () => {
    const areaId = deadId('areas')
    const snapshot = {
      area: { name: '__replay_area__', parentFk: parentAreaId, regionFk: homeRegionId },
      areaId,
      mode: 'hard' as const,
      parking: [{ lat: 47.1, long: 8.2 }],
    }

    await Promise.all([1, 2].map(() => asRequest(maintainer.authId, () => restoreArea(snapshot))))

    expect(await count('areas', areaId)).toBe(1)
    expect(await sql`select id from public.geolocations where area_fk = ${areaId}`).toHaveLength(1)
  })

  it('restores a block once and shifts its siblings once', async () => {
    const sibling = await createBlock('__replay_sibling__', sectorAreaId, homeRegionId)
    await sql`update public.blocks set "order" = 5 where id = ${sibling}`
    const blockId = deadId('blocks')
    const snapshot = {
      areaFk: sectorAreaId,
      block: { description: null, name: '__replay_block__', order: 5, regionFk: homeRegionId },
      blockId,
      geolocation: null,
      mode: 'hard' as const,
    }

    await Promise.all([1, 2].map(() => asRequest(maintainer.authId, () => restoreBlock(snapshot))))
    await asRequest(maintainer.authId, () => restoreBlock(snapshot))

    expect(await count('blocks', blockId)).toBe(1)
    const [row] = await sql<{ order: number }[]>`select "order" as "order" from public.blocks where id = ${sibling}`
    expect(row.order).toBe(6)
  })

  it('restores a route once when two Undos race', async () => {
    const blockId = await createBlock('__replay_route_block__', sectorAreaId, homeRegionId)
    const routeId = deadId('routes')
    const snapshot = {
      firstAscensionistFks: [],
      mode: 'hard' as const,
      route: {
        areaFks: null,
        areaIds: null,
        blockFk: blockId,
        createdBy: 0,
        description: null,
        firstAscentYear: null,
        gradeFk: null,
        name: '__replay_route__',
        rating: null,
        regionFk: homeRegionId,
      },
      routeId,
      tags: [],
    }

    await Promise.all([1, 2].map(() => asRequest(maintainer.authId, () => restoreRoute(snapshot))))

    expect(await count('routes', routeId)).toBe(1)
  })
})
