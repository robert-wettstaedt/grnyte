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
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HOME = '__restore_home__'
const OTHER = '__restore_other__'

/** No row has this id. The snapshot's own `areaId`/`blockId` only ever addresses activity history,
 *  which a restore reassigns and which these tests do not create. */
const DEAD_ID = 999_999_999

let maintainer: SeedUser
let homeRegionId = 0
let otherRegionId = 0
let parentAreaId = 0
let cragAreaId = 0

async function createArea(name: string, regionId: number, type: 'area' | 'crag'): Promise<number> {
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

/**
 * The status a handler rejected with, or `undefined` when it did not reject at all.
 *
 * Both `error()` and Kit's schema rejection throw a plain `HttpError`, which is not an `Error`, so
 * `rejects.toThrow()` cannot read it. The status is also the assertion worth making: a 400 from the
 * schema and a 403 from the gate are two different refusals.
 */
async function statusOf(run: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await run()
    return undefined
  } catch (thrown) {
    return (thrown as { status?: number })?.status
  }
}

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({ maintainer: 'maintainer@grnyte.rocks' })
  maintainer = users.maintainer

  homeRegionId = await createRegion(HOME)
  otherRegionId = await createRegion(OTHER)

  // `canAddArea` wants a parent that is untyped or an 'area'; `canAddBlock` wants a 'crag'.
  parentAreaId = await createArea('__restore_parent__', homeRegionId, 'area')
  cragAreaId = await createArea('__restore_crag__', homeRegionId, 'crag')
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
        areaId: DEAD_ID,
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
      area: { name: '__restore_typed_area__', parentFk: null, regionFk: homeRegionId, type: 'crag' },
      areaId: DEAD_ID,
      mode: 'hard',
      parking: [],
    } as unknown as Parameters<typeof restoreArea>[0]

    await asRequest(maintainer.authId, () => restoreArea(snapshot))

    const [row] = await sql<{ type: null | string }[]>`
      select type from public.areas where name = '__restore_typed_area__'`

    // `refreshAreaType` owns this column, and the gate this restore ran (`canAddArea`) refuses
    // 'crag' outright, so a snapshot must not be able to mint through undo what create rejects: a
    // crag with no blocks, which `canAddParking` then accepts.
    expect(row.type).toBeNull()
  })

  it('refuses a parking pin that is not on the globe, and creates nothing', async () => {
    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreArea({
          area: { name: '__restore_offglobe_area__', parentFk: null, regionFk: homeRegionId },
          areaId: DEAD_ID,
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
        areaFk: cragAreaId,
        block: { description: 'Flat landing.', name: '__restore_block__', order: 0, regionFk: homeRegionId },
        blockId: DEAD_ID,
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
      areaFk: cragAreaId,
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
          areaFk: cragAreaId,
          block: { description: null, name: '__restore_foreign_block__', order: 0, regionFk: otherRegionId },
          blockId: DEAD_ID,
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
          areaFk: cragAreaId,
          block: { description: null, name: '__restore_offglobe_block__', order: 0, regionFk: homeRegionId },
          blockId: DEAD_ID,
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
    const blockId = await createBlock('__restore_rating_block__', cragAreaId, homeRegionId)

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreRoute({
          firstAscensionistFks: [],
          mode: 'hard',
          route: { ...snapshotFor(blockId, '__restore_rating_route__'), rating: 42 },
          routeId: DEAD_ID,
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
    const blockId = await createBlock('__restore_year_block__', cragAreaId, homeRegionId)

    const status = await statusOf(() =>
      asRequest(maintainer.authId, () =>
        restoreRoute({
          firstAscensionistFks: [],
          mode: 'hard',
          route: { ...snapshotFor(blockId, '__restore_year_route__'), firstAscentYear: -500 },
          routeId: DEAD_ID,
          tags: [],
        }),
      ),
    )

    expect(status).toBe(400)

    const rows = await sql<{ id: number }[]>`
      select id from public.routes where name = '__restore_year_route__'`
    expect(rows).toHaveLength(0)
  })

  it("drops a first ascensionist belonging to a region other than the route's", async () => {
    const blockId = await createBlock('__restore_fa_block__', cragAreaId, homeRegionId)
    const foreign = await createFirstAscensionist('__restore_foreign_fa__', otherRegionId)
    const own = await createFirstAscensionist('__restore_own_fa__', homeRegionId)

    await asRequest(maintainer.authId, () =>
      restoreRoute({
        firstAscensionistFks: [own, foreign],
        mode: 'hard',
        route: snapshotFor(blockId, '__restore_fa_route__'),
        routeId: DEAD_ID,
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
   * The three columns `restoreRoute` refuses to take from the snapshot, and the only test that
   * looks at them.
   *
   * The route path reaches the INSERT in exactly one other place (the first-ascensionist case
   * above), and that one asserts only the junction, so every derivation was unguarded: swap
   * `createdBy: user.id` back to `snapshot.route.createdBy`, or copy `areaFks`/`areaIds` through
   * instead of recomputing them from `areaAncestry(block.areaFk)`, and the whole suite stayed
   * green. `restoreFidelity` cannot cover it either, since it excludes these columns by design.
   * The handler's own comment calls this out: a DELETE holder could otherwise restore a route
   * with forged authorship into another region's block, carrying poisoned search tokens.
   */
  it('stamps the caller as author and recomputes the area chain from the stored block', async () => {
    const blockId = await createBlock('__restore_derive_block__', cragAreaId, homeRegionId)

    await asRequest(maintainer.authId, () =>
      restoreRoute({
        firstAscensionistFks: [],
        mode: 'hard',
        // `snapshotFor` forges `createdBy: 0` and leaves `areaFks`/`areaIds` null, so none of the
        // values below can have come from the snapshot.
        route: snapshotFor(blockId, '__restore_derive_route__'),
        routeId: DEAD_ID,
        tags: [],
      }),
    )

    const [row] = await sql<{ areaFks: number[]; areaIds: string; createdBy: number; regionFk: number }[]>`
      select created_by as "createdBy", region_fk as "regionFk", area_fks as "areaFks", area_ids as "areaIds"
      from public.routes where name = '__restore_derive_route__'`

    expect(row).toEqual({
      areaFks: [cragAreaId],
      areaIds: `^${cragAreaId}$`,
      createdBy: maintainer.userId,
      regionFk: homeRegionId,
    })
  })
})
