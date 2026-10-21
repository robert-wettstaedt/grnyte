// @vitest-environment node
import { db } from '$lib/db/db.server'
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteRegionRows } from './delete.server'

const REGION_NAME = '__delete_region_rows__'

let owner: SeedUser
let outsider: SeedUser
let regionId = 0
let faId = 0

/** Every table that belongs to a region carries `region_fk`, so this is the whole region. */
const leftovers = async () => {
  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'region_fk'`
  const counts = await Promise.all(
    tables.map(async ({ table_name }) => {
      const [{ count }] = await sql<{ count: number }[]>`
        select count(*)::int as count from ${sql('public.' + table_name)} where region_fk = ${regionId}`
      return [table_name, count] as const
    }),
  )
  return Object.fromEntries(counts.filter(([, count]) => count > 0))
}

beforeAll(async () => {
  if (!reachable) return
  ;[owner, outsider] = await Promise.all([
    createThrowawayUser('region_rows_owner'),
    createThrowawayUser('region_rows_out'),
  ])

  ;[{ id: regionId }] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${REGION_NAME}, ${owner.userId}) returning id`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${owner.userId}, ${owner.authId}, 'region_admin', true)`
  await sql`
    insert into public.region_invitations (region_fk, token, invited_by, email, expires_at)
    values (${regionId}, gen_random_uuid(), ${owner.userId}, 'someone@grnyte.test', now() + interval '1 day')`

  const [{ id: parent }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type) values ('Gebiet', ${owner.userId}, ${regionId}, 'area')
    returning id`
  const [{ id: areaId }] = await sql<{ id: number }[]>`
    insert into public.areas (name, created_by, region_fk, type, parent_fk)
    values ('Sektor', ${owner.userId}, ${regionId}, 'sector', ${parent}) returning id`
  const [{ id: blockId }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, created_by, region_fk, area_fk, "order")
    values ('Block', ${owner.userId}, ${regionId}, ${areaId}, 0) returning id`
  const [{ id: geoId }] = await sql<{ id: number }[]>`
    insert into public.geolocations (region_fk, lat, long, block_fk) values (${regionId}, 50.9, 14.1, ${blockId})
    returning id`
  await sql`update public.blocks set geolocation_fk = ${geoId} where id = ${blockId}`

  const [{ id: routeId }] = await sql<{ id: number }[]>`
    insert into public.routes (name, created_by, region_fk, block_fk) values ('Route', ${owner.userId}, ${regionId}, ${blockId})
    returning id`
  const [{ id: externalId }] = await sql<{ id: number }[]>`
    insert into public.route_external_resources (region_fk, route_fk) values (${regionId}, ${routeId}) returning id`
  const [{ id: eightA }] = await sql<{ id: number }[]>`
    insert into public.route_external_resource_8a (region_fk, external_resources_fk) values (${regionId}, ${externalId})
    returning id`
  await sql`update public.route_external_resources set external_resource_8a_fk = ${eightA} where id = ${externalId}`
  await sql`update public.routes set external_resources_fk = ${externalId} where id = ${routeId}`
  await sql`insert into public.routes_to_tags (region_fk, route_fk, tag_fk) values (${regionId}, ${routeId}, 'crimpy')`

  ;[{ id: faId }] = await sql<{ id: number }[]>`
    insert into public.first_ascensionists (region_fk, name, user_fk) values (${regionId}, 'Ada', ${outsider.userId})
    returning id`
  await sql`update public.users set first_ascentionist_fk = ${faId} where id = ${outsider.userId}`
  await sql`
    insert into public.routes_to_first_ascensionists (region_fk, first_ascensionist_fk, route_fk)
    values (${regionId}, ${faId}, ${routeId})`

  const [{ id: photo }] = await sql<{ id: string }[]>`
    insert into public.files (id, region_fk, path, block_fk, created_by)
    values (gen_random_uuid()::text, ${regionId}, '/topo.jpg', ${blockId}, ${owner.userId}) returning id`
  const [{ id: topoId }] = await sql<{ id: number }[]>`
    insert into public.topos (region_fk, block_fk, file_fk) values (${regionId}, ${blockId}, ${photo}) returning id`
  await sql`
    insert into public.topo_routes (region_fk, top_type, route_fk, topo_fk) values (${regionId}, 'top', ${routeId}, ${topoId})`

  const [{ id: ascentId }] = await sql<{ id: number }[]>`
    insert into public.ascents (region_fk, created_by, type, route_fk) values (${regionId}, ${owner.userId}, 'flash', ${routeId})
    returning id`
  const [{ id: video }] = await sql<{ id: string }[]>`
    insert into public.files (id, region_fk, path, ascent_fk, created_by)
    values (gen_random_uuid()::text, ${regionId}, '', ${ascentId}, ${owner.userId}) returning id`
  await sql`insert into public.bunny_streams (id, region_fk, file_fk) values ('5e0d6a8e-0000-4000-8000-00000000d31e', ${regionId}, ${video})`
  await sql`update public.files set bunny_stream_fk = '5e0d6a8e-0000-4000-8000-00000000d31e' where id = ${video}`

  const [{ id: eventId }] = await sql<{ id: number }[]>`
    insert into public.events (verb, actor_fk, region_fk, route_fk) values ('create', ${owner.userId}, ${regionId}, ${routeId})
    returning id`
  await sql`
    insert into public.reactions (event_fk, body, type, region_fk, auth_user_fk, user_fk)
    values (${eventId}, 'nice', 'comment', ${regionId}, ${owner.authId}, ${owner.userId})`
  await sql`
    insert into public.favorites (region_fk, auth_user_fk, user_fk, route_fk)
    values (${regionId}, ${owner.authId}, ${owner.userId}, ${routeId})`
})

afterAll(async () => {
  if (reachable) {
    // A failed run leaves the region behind; take it with the function under test once it works.
    await db.transaction((tx) => deleteRegionRows(tx, regionId))
    await sql`update public.users set first_ascentionist_fk = null where id = ${outsider.userId}`
    await Promise.all([dropThrowawayUser(owner), dropThrowawayUser(outsider)])
  }
  await sql.end()
})

describe.skipIf(!reachable)('deleteRegionRows', () => {
  it('leaves no row of the region behind, and hands back every file for storage removal', async () => {
    expect(Object.keys(await leftovers()).length).toBeGreaterThan(15)

    const targets = await db.transaction((tx) => deleteRegionRows(tx, regionId))

    expect(await leftovers()).toEqual({})
    const [{ count }] = await sql<
      { count: number }[]
    >`select count(*)::int as count from public.regions where id = ${regionId}`
    expect(count).toBe(0)
    expect(targets).toEqual(
      expect.arrayContaining([
        { video: '5e0d6a8e-0000-4000-8000-00000000d31e' },
        { images: expect.arrayContaining([]) },
      ]),
    )
    expect(targets).toHaveLength(2)

    // A first ascensionist of this region linked from a profile elsewhere loses the link, not the profile.
    const [user] = await sql<{ fa: null | number }[]>`
      select first_ascentionist_fk as fa from public.users where id = ${outsider.userId}`
    expect(user.fa).toBeNull()
  })
})
