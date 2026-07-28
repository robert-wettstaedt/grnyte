// @vitest-environment node
/**
 * What editing a region's tag vocabulary does to `routes_to_tags`.
 *
 * Real database, real fixtures, for the same reason as `guards.server.test.ts`: every function here
 * is a statement, and the one thing worth asserting is a primary-key collision that only a real
 * database can raise. The connection is the superuser one (RLS bypassed) because these run inside
 * an already RLS-scoped transaction in production - the question here is the statement, not the
 * policy.
 *
 * Skipped when DATABASE_URL is unreachable so `npm test` still passes without a local database.
 */
import { db } from '$lib/db/db.server'
import { reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addTag, removeTag, renameTag, tagUsage } from './tags.server'

const REGION = '__tags_region__'
const OTHER_REGION = '__tags_other__'

let admin = {} as SeedUser
let regionId = 0
let otherRegionId = 0
/** Two routes in the fixture region, one in the other, so region scoping is observable. */
let routes: number[] = []
let otherRoute = 0

/** The vocabulary as stored, which every mutation rewrites alongside the junction rows. */
const storedTags = async (id: number): Promise<string[]> => {
  const [row] = await sql<{ tags: string[] }[]>`select settings->'tags' as tags from public.regions where id = ${id}`
  return row.tags ?? []
}

const tagsOn = async (routeFk: number): Promise<string[]> => {
  const rows = await sql<{ tagFk: string }[]>`
    select tag_fk as "tagFk" from public.routes_to_tags where route_fk = ${routeFk} order by tag_fk`
  return rows.map((row) => row.tagFk)
}

async function removeFixtures() {
  const names = [REGION, OTHER_REGION]
  await sql`delete from public.routes_to_tags where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.routes where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.blocks where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.areas where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.region_members where region_fk in (select id from public.regions where name = any(${names}))`
  await sql`delete from public.regions where name = any(${names})`
}

/** A region with one area, one block and `count` routes hung off it. */
async function seedRegion(name: string, count: number): Promise<{ id: number; routeIds: number[] }> {
  const [{ id }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${name}, ${admin.userId}, 10) returning id`

  const [{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk) values (${name}, ${admin.userId}, ${id}) returning id`

  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", created_by, area_fk, region_fk)
    values (${name}, 0, ${admin.userId}, ${areaId}, ${id}) returning id`

  const routeIds: number[] = []
  for (let index = 0; index < count; index += 1) {
    const [{ id: routeId }] = await sql<{ id: number }[]>`
      insert into public.routes (name, created_by, block_fk, region_fk)
      values (${`${name}-${index}`}, ${admin.userId}, ${blockId}, ${id}) returning id`
    routeIds.push(routeId)
  }

  return { id, routeIds }
}

const tagRoute = (routeFk: number, regionFk: number, tag: string) =>
  sql`insert into public.routes_to_tags (route_fk, tag_fk, region_fk) values (${routeFk}, ${tag}, ${regionFk})`

beforeAll(async () => {
  if (!reachable) return
  ;({ admin } = await seedUsers({ admin: 'admin@grnyte.rocks' }))

  await removeFixtures()

  const fixture = await seedRegion(REGION, 2)
  regionId = fixture.id
  routes = fixture.routeIds

  const other = await seedRegion(OTHER_REGION, 1)
  otherRegionId = other.id
  otherRoute = other.routeIds[0]
}, 30_000)

beforeEach(async () => {
  if (!reachable) return

  await sql`delete from public.routes_to_tags where region_fk in (${regionId}, ${otherRegionId})`
  await sql`update public.regions set settings = jsonb_build_object('tags', '["SD","high"]'::jsonb)
            where id in (${regionId}, ${otherRegionId})`
})

afterAll(async () => {
  if (reachable) await removeFixtures()
  await sql.end()
})

describe.skipIf(!reachable)('tagUsage', () => {
  it('counts per tag, leaving a tag no route carries out of the map entirely', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(routes[1], regionId, 'SD')

    // The absent key is the point: the settings screen reads it as a real zero, and reads
    // `undefined` (no map yet) as "do not offer to delete this".
    expect(await tagUsage(db, regionId)).toEqual({ SD: 2 })
  })

  it('counts only the region asked about, so a word two regions share does not bleed', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(otherRoute, otherRegionId, 'SD')

    expect(await tagUsage(db, regionId)).toEqual({ SD: 1 })
    expect(await tagUsage(db, otherRegionId)).toEqual({ SD: 1 })
  })
})

describe.skipIf(!reachable)('addTag', () => {
  it('appends without touching any route', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await addTag(db, regionId, ['SD', 'high'], 'dyno')

    expect(await storedTags(regionId)).toEqual(['SD', 'high', 'dyno'])
    expect(await tagUsage(db, regionId)).toEqual({ SD: 1 })
  })
})

describe.skipIf(!reachable)('renameTag', () => {
  it('carries the tag onto every route already tagged with it', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(routes[1], regionId, 'SD')

    await renameTag(db, regionId, ['SD', 'high'], 'SD', 'Sitzstart')

    expect(await storedTags(regionId)).toEqual(['Sitzstart', 'high'])
    expect(await tagUsage(db, regionId)).toEqual({ Sitzstart: 2 })
  })

  // The reason the vocabulary check in `renameRegionTag` is not enough on its own: `updateRoute`
  // widens its allowlist with the route's own current tags, so a route can carry a tag that has
  // already left the vocabulary. Renaming onto that name meets the non-deferrable
  // (route_fk, tag_fk) primary key unless the losing row goes first.
  it('survives renaming onto a name a route already carries outside the vocabulary', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(routes[0], regionId, 'retired')
    await tagRoute(routes[1], regionId, 'SD')

    await renameTag(db, regionId, ['SD', 'high'], 'SD', 'retired')

    // One row per route, not a duplicate and not a lost tag.
    expect(await tagsOn(routes[0])).toEqual(['retired'])
    expect(await tagsOn(routes[1])).toEqual(['retired'])
    expect(await storedTags(regionId)).toEqual(['retired', 'high'])
  })

  it('moves only the renaming region rows, so two regions may share a word', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(otherRoute, otherRegionId, 'SD')

    await renameTag(db, regionId, ['SD', 'high'], 'SD', 'Sitzstart')

    expect(await tagsOn(routes[0])).toEqual(['Sitzstart'])
    expect(await tagsOn(otherRoute)).toEqual(['SD'])
    expect(await storedTags(otherRegionId)).toEqual(['SD', 'high'])
  })
})

describe.skipIf(!reachable)('removeTag', () => {
  it('deletes the tag from every route that carries it, and only that tag', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(routes[0], regionId, 'high')
    await tagRoute(routes[1], regionId, 'SD')

    await removeTag(db, regionId, ['SD', 'high'], 'SD')

    expect(await tagsOn(routes[0])).toEqual(['high'])
    expect(await tagsOn(routes[1])).toEqual([])
    expect(await storedTags(regionId)).toEqual(['high'])
  })

  it('leaves another region alone', async () => {
    await tagRoute(routes[0], regionId, 'SD')
    await tagRoute(otherRoute, otherRegionId, 'SD')

    await removeTag(db, regionId, ['SD', 'high'], 'SD')

    expect(await tagsOn(otherRoute)).toEqual(['SD'])
  })
})
