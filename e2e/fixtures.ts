/**
 * The entity tree the browser-only specs drive. Built per run, because CI seeds only the four tier
 * logins. Every function takes the caller's pool: Playwright runs the spec files in one worker
 * process, so `testDb`'s is shared and the first `end()` strands the rest.
 */
import type { Sql } from 'postgres'
import type { SeedUser } from '../src/lib/db/testAccounts'
// Type only, so it is erased before this runs: the Playwright process has no vite aliases.
import type { RegionSettings } from '../src/lib/entities/region/settings'

export interface Fixture {
  alphaBlockId: number
  alphaSectorId: number
  /** Second region, so the region-scoped forms have a pair to move between. Carries a map layer. */
  altRegionId: number
  /** Named but with no ascents, files or topo lines, so `deleteRoute` takes its hard path. */
  bareRouteId: number
  betaBlockId: number
  betaRouteId: number
  betaSectorId: number
  /** Something for a comment to hang off: comments attach to events, not to routes. */
  eventId: number
  /** On `richRoute`, so the edit form has a chip that must not follow the reader. */
  firstAscensionist: string
  invitationId: number
  /** Already soft deleted, under `betaBlock`. An undo that clears more than its own delete marked
   *  would resurrect it. */
  preDeletedRouteId: number
  /** Region the tree lives in. The driver is `region_admin` here. */
  regionId: number
  richAscentId: number
  /** Graded, described, rated, tagged and with a first ascensionist, so a leak into the sparse
   *  side shows in either half of `routeListsFingerprint`. */
  richRouteId: number
  rootAreaId: number
  /** The tag on `richRoute`, from the region's own vocabulary. */
  routeTag: string
  /** Childless, so the add-sub-area form has a second parent. */
  spareAreaId: number
  sparseAscentId: number
  sparseRouteId: number
}

export const altName = (name: string) => `${name}_alt`

export const FIRST_ASCENSIONIST = 'E2E Erstbegeher'

/** Spelled out rather than left to `DEFAULT_TAGS`, which an empty array would fall back to. */
const FIXTURE_TAGS = ['benchmark', 'defined', 'high']

/**
 * Written straight onto `regions.settings`: a row being inserted has nothing to merge with, so it
 * skips `settings.server.ts` (the exception AGENTS.md names). Typed, because a layer that misses
 * the stored shape is dropped on read and nothing fails until a browser renders it.
 */
const ALT_SETTINGS: RegionSettings = {
  mapLayers: [
    {
      attributions: [],
      minZoom: 14,
      name: 'E2E Relief',
      opacity: 0.7,
      params: { LAYERS: 'e2e_relief' },
      type: 'wms',
      url: 'https://example.invalid/wms?LAYERS=e2e_relief',
    },
  ],
  tags: [],
}

/** Drop both regions and everything scoped to them. Region data has FK cycles
 *  (blocks <-> geolocations), so this copies `purge-region.ts`: one transaction, FK enforcement
 *  off, every table with a `region_fk` discovered from the schema. */
export async function removeFixture(sql: Sql, name: string): Promise<void> {
  const names = [name, altName(name)]

  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'region_fk'
    order by table_name`

  await sql.begin(async (tx) => {
    await tx`set local search_path to public`
    await tx`set local session_replication_role = replica`

    const ids = await tx<{ id: number }[]>`select id from public.regions where name = any(${names})`
    if (ids.length === 0) return

    const regionIds = ids.map((row) => row.id)

    await tx`
      update public.users set first_ascentionist_fk = null
      where first_ascentionist_fk in (
        select id from public.first_ascensionists where region_fk = any(${regionIds})
      )`

    for (const { table_name } of tables) {
      await tx`delete from ${tx(table_name)} where region_fk = any(${regionIds})`
    }

    await tx`delete from public.regions where id = any(${regionIds})`
  })
}

/** Build the tree. `driver` is `region_admin` in both regions; `second` is a plain member, so the
 *  membership specs have somebody to remove who is not the driver. */
export async function seedFixture(sql: Sql, name: string, driver: SeedUser, second: SeedUser): Promise<Fixture> {
  await removeFixture(sql, name)

  const regionId = await insertRegion(sql, name, driver, { mapLayers: [], tags: [...FIXTURE_TAGS] })
  const altRegionId = await insertRegion(sql, altName(name), driver, ALT_SETTINGS)

  await addMember(sql, regionId, driver, 'region_admin')
  await addMember(sql, regionId, second, 'region_user')
  await addMember(sql, altRegionId, driver, 'region_admin')

  const rootAreaId = await insertArea(sql, regionId, driver, 'E2E Root', 'area', null)
  const spareAreaId = await insertArea(sql, regionId, driver, 'E2E Spare', null, rootAreaId)
  const alphaSectorId = await insertArea(sql, regionId, driver, 'E2E Alpha', 'sector', rootAreaId)
  const betaSectorId = await insertArea(sql, regionId, driver, 'E2E Beta', 'sector', rootAreaId)

  const alphaBlockId = await insertBlock(sql, regionId, driver, 'Alpha Block', alphaSectorId, 0, 47.111111, 8.111111)
  const betaBlockId = await insertBlock(sql, regionId, driver, 'Beta Block', betaSectorId, 0, 47.222222, 8.222222)

  const alphaChain = [rootAreaId, alphaSectorId]
  const betaChain = [rootAreaId, betaSectorId]

  const richRouteId = await insertRoute(sql, regionId, driver, 'Alpha Route', alphaBlockId, alphaChain, {
    description: 'Alpha description',
    gradeFk: 12,
    rating: 3,
  })
  const sparseRouteId = await insertRoute(sql, regionId, driver, '', alphaBlockId, alphaChain)
  const bareRouteId = await insertRoute(sql, regionId, driver, 'Bare Route', alphaBlockId, alphaChain)
  const betaRouteId = await insertRoute(sql, regionId, driver, 'Beta Route', betaBlockId, betaChain)

  await linkFirstAscensionist(sql, regionId, richRouteId, FIRST_ASCENSIONIST)
  await linkTag(sql, regionId, richRouteId, FIXTURE_TAGS[0])

  const richAscentId = await insertAscent(sql, regionId, driver, richRouteId, 'redpoint', {
    dateTime: '2026-04-16',
    gradeFk: 12,
    notes: 'Alpha ascent notes',
    rating: 3,
  })
  const sparseAscentId = await insertAscent(sql, regionId, driver, betaRouteId, 'flash', { dateTime: '2025-09-25' })

  const preDeletedRouteId = await insertRoute(sql, regionId, driver, 'Already Deleted', betaBlockId, betaChain)
  await sql`update public.routes set deleted_at = '2025-01-01T00:00:00Z' where id = ${preDeletedRouteId}`

  // No "undo" in the address: it would collide with the snackbar's Undo in a name locator.
  const invitationId = await insertInvitation(sql, regionId, driver, `e2e-guest-${crypto.randomUUID()}@grnyte.test`)
  const eventId = await insertEvent(sql, regionId, driver, alphaSectorId)

  return {
    alphaBlockId,
    alphaSectorId,
    altRegionId,
    bareRouteId,
    betaBlockId,
    betaRouteId,
    betaSectorId,
    eventId,
    firstAscensionist: FIRST_ASCENSIONIST,
    invitationId,
    preDeletedRouteId,
    regionId,
    richAscentId,
    richRouteId,
    rootAreaId,
    routeTag: FIXTURE_TAGS[0],
    spareAreaId,
    sparseAscentId,
    sparseRouteId,
  }
}

async function addMember(sql: Sql, regionId: number, user: SeedUser, role: string): Promise<void> {
  await sql`
    insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk)
    values (${regionId}, ${role}, true, ${user.authId}, ${user.userId})`
}

async function insertArea(
  sql: Sql,
  regionId: number,
  owner: SeedUser,
  name: string,
  type: null | string,
  parentFk: null | number,
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, parent_fk, region_fk, created_by)
    values (${name}, ${type}, ${parentFk}, ${regionId}, ${owner.userId}) returning id`

  return row.id
}

async function insertAscent(
  sql: Sql,
  regionId: number,
  owner: SeedUser,
  routeFk: number,
  type: string,
  extra: { dateTime?: string; gradeFk?: number; notes?: string; rating?: number } = {},
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into public.ascents (route_fk, region_fk, created_by, type, date_time, grade_fk, rating, notes)
    values (
      ${routeFk}, ${regionId}, ${owner.userId}, ${type}, ${extra.dateTime ?? '2026-01-15'},
      ${extra.gradeFk ?? null}, ${extra.rating ?? null}, ${extra.notes ?? null}
    ) returning id`

  return row.id
}

async function insertBlock(
  sql: Sql,
  regionId: number,
  owner: SeedUser,
  name: string,
  areaFk: number,
  order: number,
  lat: number,
  long: number,
): Promise<number> {
  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, "order", region_fk, created_by)
    values (${name}, ${areaFk}, ${order}, ${regionId}, ${owner.userId}) returning id`

  // A distinct pin per block, which is what proves BlockForm re-seeds its own map state.
  const [pin] = await sql<{ id: number }[]>`
    insert into public.geolocations (lat, long, block_fk, region_fk)
    values (${lat}, ${long}, ${block.id}, ${regionId}) returning id`
  await sql`update public.blocks set geolocation_fk = ${pin.id} where id = ${block.id}`

  return block.id
}

/** `create`, the verb `createArea` actually writes. `add` has no catalogue entry without a column
 *  name, so the card would fall through to the generic "made a change". */
async function insertEvent(sql: Sql, regionId: number, actor: SeedUser, areaFk: number): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into public.events (region_fk, actor_fk, verb, area_fk)
    values (${regionId}, ${actor.userId}, 'create', ${areaFk}) returning id`

  return row.id
}

async function insertInvitation(sql: Sql, regionId: number, inviter: SeedUser, email: string): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into public.region_invitations (region_fk, token, invited_by, email, expires_at)
    values (${regionId}, ${crypto.randomUUID()}::uuid, ${inviter.userId}, ${email}, now() + interval '7 days')
    returning id`

  return row.id
}

async function insertRegion(sql: Sql, name: string, owner: SeedUser, settings: RegionSettings): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members, settings)
    values (${name}, ${owner.userId}, 10, ${sql.json(settings as never)}) returning id`

  return row.id
}

/** `areaFks` is the block's area chain, root first. `listRoutes` filters on the denormalized
 *  `areaIds` alone, so a route with these NULL is invisible to every area page. The `^id$` shape
 *  has to match `createRoute`. */
async function insertRoute(
  sql: Sql,
  regionId: number,
  owner: SeedUser,
  name: string,
  blockFk: number,
  areaFks: number[],
  extra: { description?: string; gradeFk?: number; rating?: number } = {},
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    insert into public.routes (
      name, block_fk, region_fk, created_by, description, grade_fk, rating, area_fks, area_ids
    )
    values (
      ${name}, ${blockFk}, ${regionId}, ${owner.userId},
      ${extra.description ?? null}, ${extra.gradeFk ?? null}, ${extra.rating ?? null},
      ${areaFks}, ${areaFks.map((id) => `^${id}$`).join(',')}
    ) returning id`

  return row.id
}

/** A named first ascensionist with no account, which is the form the chip list renders. */
async function linkFirstAscensionist(sql: Sql, regionId: number, routeFk: number, name: string): Promise<void> {
  const [person] = await sql<{ id: number }[]>`
    insert into public.first_ascensionists (region_fk, name) values (${regionId}, ${name}) returning id`
  await sql`
    insert into public.routes_to_first_ascensionists (region_fk, first_ascensionist_fk, route_fk)
    values (${regionId}, ${person.id}, ${routeFk})`
}

/** One tag on a route, so the rich route differs from the sparse one in BOTH halves of
 *  `routeListsFingerprint`. Free text keyed to `regions.settings.tags`, so it has to be a word the
 *  region offers or the chip never renders. */
async function linkTag(sql: Sql, regionId: number, routeFk: number, tag: string): Promise<void> {
  await sql`
    insert into public.routes_to_tags (region_fk, route_fk, tag_fk) values (${regionId}, ${routeFk}, ${tag})`
}
