/**
 * The tenancy boundary of synced reads: `deployment/powersync/sync-config.yaml`, evaluated by PowerSync's own
 * sync-rules engine the way the service does (parameter rows build the lookup index, the token picks the buckets,
 * every data row is routed into buckets), against real rows in the test database. RLS never sees this path.
 *
 * Two fixture regions with one member each: `user@` in A, a throwaway account in B. Skipped without DATABASE_URL.
 */
import {
  createThrowawayUser,
  dropThrowawayUser,
  reachable,
  seedTwoRegions,
  seedUsers,
  sql,
  type SeedUser,
} from '$lib/db/testDb'
import type { RequestedStream } from '@powersync/service-sync-rules'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { syncedTables, SyncedWorld, type Held } from './evaluate.server'

const REGION_A = '__streams_a__'
const REGION_B = '__streams_b__'
/** No auth user has this id. */
const NOBODY = '00000000-0000-0000-0000-000000000000'

/** Every table a region stream reads, by the column that ties it to a region. */
const REGION_TABLES = [
  'areas',
  'ascents',
  'blocks',
  'bunny_streams',
  'favorites',
  'files',
  'first_ascensionists',
  'geolocations',
  'region_members',
  'routes',
  'routes_to_first_ascensionists',
  'routes_to_tags',
  'topo_routes',
  'topos',
] as const
const GLOBAL_TABLES = ['grades', 'regions', 'role_permissions', 'user_roles', 'user_settings', 'users'] as const

let world = new SyncedWorld()
let users = {} as Record<'insider' | 'outsider', SeedUser>
let regionA = 0
let regionB = 0

const holdings = (authId: string, streams?: Record<string, RequestedStream[]>) => world.holdings(authId, streams)

/** Which fixture regions a set of rows touches, per table. */
function regionsByTable(rows: Held[]): Record<string, number[]> {
  const out: Record<string, Set<number>> = {}
  for (const { data, table } of rows) {
    const regionFk = Number(table === 'regions' ? data.id : data.region_fk)
    if (regionFk === regionA || regionFk === regionB) (out[table] ??= new Set()).add(regionFk)
  }
  return Object.fromEntries(Object.entries(out).map(([table, set]) => [table, [...set].sort()]))
}

async function removeFixtures() {
  const regions = sql`(select id from public.regions where name = any(${[REGION_A, REGION_B]}))`
  for (const table of [
    'bunny_streams',
    'favorites',
    'ascents',
    'topo_routes',
    'routes_to_tags',
    'routes_to_first_ascensionists',
    'topos',
    'files',
    'geolocations',
    'routes',
    'first_ascensionists',
    'blocks',
    'areas',
    'region_members',
  ]) {
    await sql`delete from ${sql('public.' + table)} where region_fk in ${regions}`
  }
  await sql`delete from public.regions where name = any(${[REGION_A, REGION_B]})`
}

/** Reads the fixture world and runs it through the engine, as replication would after every change. */
async function replicate() {
  world = new SyncedWorld()
  const regions = [regionA, regionB]
  for (const table of [...REGION_TABLES, ...GLOBAL_TABLES]) {
    // Parameter tables are read whole: a membership elsewhere must not leak in through a missing lookup row.
    const whole = table === 'region_members' || !(REGION_TABLES as readonly string[]).includes(table)
    world.add(
      table,
      whole
        ? await sql`select * from ${sql('public.' + table)}`
        : await sql`select * from ${sql('public.' + table)} where region_fk = any(${regions})`,
    )
  }
}

/** One row in every region table, so a stream that ignores membership has something to leak. */
async function seedRegionContent(regionFk: number, member: SeedUser) {
  const [{ id: areaFk }] = await sql<{ id: number }[]>`
    insert into public.areas (name, region_fk, created_by) values ('__streams_area__', ${regionFk}, ${member.userId})
    returning id`
  const [{ id: blockFk }] = await sql<{ id: number }[]>`
    insert into public.blocks (name, "order", area_fk, region_fk, created_by)
    values ('__streams_block__', 0, ${areaFk}, ${regionFk}, ${member.userId}) returning id`
  const [{ id: routeFk }] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by)
    values ('__streams_route__', ${blockFk}, ${regionFk}, ${member.userId}) returning id`
  const fileId = crypto.randomUUID()
  await sql`insert into public.files (id, path, region_fk, created_by) values (${fileId}, '/__streams__', ${regionFk}, ${member.userId})`
  await sql`insert into public.bunny_streams (id, region_fk, file_fk) values (${crypto.randomUUID()}, ${regionFk}, ${fileId})`
  const [{ id: topoFk }] = await sql<{ id: number }[]>`
    insert into public.topos (block_fk, file_fk, region_fk) values (${blockFk}, ${fileId}, ${regionFk}) returning id`
  await sql`insert into public.topo_routes (region_fk, topo_fk, route_fk, top_type) values (${regionFk}, ${topoFk}, ${routeFk}, 'top')`
  const [{ id: faFk }] = await sql<{ id: number }[]>`
    insert into public.first_ascensionists (name, region_fk) values ('__streams_fa__', ${regionFk}) returning id`
  await sql`
    insert into public.routes_to_first_ascensionists (region_fk, route_fk, first_ascensionist_fk)
    values (${regionFk}, ${routeFk}, ${faFk})`
  await sql`insert into public.routes_to_tags (region_fk, route_fk, tag_fk) values (${regionFk}, ${routeFk}, '__streams__')`
  await sql`insert into public.geolocations (lat, long, block_fk, region_fk) values (0, 0, ${blockFk}, ${regionFk})`
  await sql`
    insert into public.ascents (region_fk, created_by, route_fk, type) values (${regionFk}, ${member.userId}, ${routeFk}, 'flash')`
  await sql`
    insert into public.favorites (region_fk, auth_user_fk, user_fk, block_fk)
    values (${regionFk}, ${member.authId}, ${member.userId}, ${blockFk})`
}

beforeAll(async () => {
  if (!reachable) return
  users = { ...(await seedUsers({ insider: 'user@grnyte.rocks' })), outsider: await createThrowawayUser('streams') }
  await removeFixtures()
  ;[regionA, regionB] = await seedTwoRegions([REGION_A, REGION_B], users.insider, users.outsider, 'region_user')
  await seedRegionContent(regionA, users.insider)
  await seedRegionContent(regionB, users.outsider)
  await replicate()
}, 60_000)

afterAll(async () => {
  if (reachable) {
    await removeFixtures()
    await dropThrowawayUser(users.outsider)
  }
  await sql.end()
})

it('checks every table a stream syncs, so a new one cannot slip past the boundary unchecked', () => {
  expect([...REGION_TABLES, ...GLOBAL_TABLES].sort()).toEqual(syncedTables)
})

describe.skipIf(!reachable)('synced reads never cross the region boundary', () => {
  it('gives a member every table of their region and nothing of another', async () => {
    const held = regionsByTable(await holdings(users.insider.authId))

    expect(held).toEqual(Object.fromEntries([...REGION_TABLES, 'regions'].sort().map((table) => [table, [regionA]])))
  })

  it('gives the other region member exactly their own region', async () => {
    const held = regionsByTable(await holdings(users.outsider.authId))

    expect(held).toEqual(Object.fromEntries([...REGION_TABLES, 'regions'].sort().map((table) => [table, [regionB]])))
  })

  it('gives an account with no memberships only the shared reference tables', async () => {
    const tables = new Set((await holdings(NOBODY)).map((row) => row.table))

    expect([...tables].sort()).toEqual(['grades', 'role_permissions'])
  })

  it('syncs another account only when it shares a region, and only your own settings and role', async () => {
    const held = await holdings(users.insider.authId)
    const userIds = held.filter((row) => row.table === 'users').map((row) => Number(row.data.id))
    const settingsOwners = held.filter((row) => row.table === 'user_settings').map((row) => row.data.auth_user_fk)
    const roleOwners = held.filter((row) => row.table === 'user_roles').map((row) => row.data.auth_user_fk)

    expect(userIds).toContain(users.insider.userId)
    expect(userIds).not.toContain(users.outsider.userId)
    expect(new Set(settingsOwners)).toEqual(new Set([users.insider.authId]))
    expect(roleOwners.filter((owner) => owner !== users.insider.authId)).toEqual([])
  })

  it("keeps a former member's name for those still in the region, and nothing of the region for them", async () => {
    // Their ascents stay in the region's activity, so the name they were logged under has to stay readable too.
    await sql`
      insert into public.region_members (region_fk, role, is_active, auth_user_fk, user_fk)
      values (${regionA}, 'region_user', false, ${users.outsider.authId}, ${users.outsider.userId})`
    try {
      await replicate()
      const insiderSees = (await holdings(users.insider.authId)).filter((row) => row.table === 'users')
      const formerGets = regionsByTable(await holdings(users.outsider.authId))

      expect(insiderSees.map((row) => Number(row.data.id))).toContain(users.outsider.userId)
      expect(Object.values(formerGets).flat()).not.toContain(regionA)
    } finally {
      await sql`delete from public.region_members where region_fk = ${regionA} and user_fk = ${users.outsider.userId}`
      await replicate()
    }
  })

  it('syncs nothing at all to a contested signup, whatever the flag holds', async () => {
    // The app refuses these tokens (`isContested`); GoTrue still issues them to whoever knows the password.
    for (const flag of [true, false, '2026-11-07T10:00:00Z']) {
      const held = await world.holdings(users.insider.authId, {}, { app_metadata: { contested_signup: flag } })

      expect(held).toEqual([])
    }
  })

  it('ignores a region the client names in its subscription', async () => {
    const asking: RequestedStream[] = [{ opaque_id: 1, parameters: { region_id: regionA }, priorityOverride: null }]
    const held = regionsByTable(await holdings(users.outsider.authId, { guidebook: asking, region_activity: asking }))

    expect(Object.values(held).flat()).not.toContain(regionA)
  })

  it('stops syncing a region once the membership is deactivated', async () => {
    await sql`update public.region_members set is_active = false where region_fk = ${regionA}`
    try {
      await replicate()
      const held = regionsByTable(await holdings(users.insider.authId))

      expect(Object.values(held).flat()).not.toContain(regionA)
    } finally {
      await sql`update public.region_members set is_active = true where region_fk = ${regionA}`
      await replicate()
    }
  })
})
