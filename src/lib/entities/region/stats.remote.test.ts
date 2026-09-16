/**
 * `regionStats` and `listAllRegions` driven as real requests, by the three callers the gate
 * distinguishes: a member of the region, an app admin who is a member of nothing, and an account
 * that is neither.
 *
 * The app-admin case is the one worth the fixture. It runs on the privileged handle with no RLS
 * underneath it, so the only thing between a stranger and every region's numbers is the check in
 * `stats.remote.ts`.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ACTIVITY_MONTHS } from './stats'
import { listAllRegions, regionStats } from './stats.remote'

const HOME = '__region_stats_home__'
const OTHER = '__region_stats_other__'
/** No events at all, for the "nothing has happened" branches. */
const QUIET = '__region_stats_quiet__'

/** `app_admin`, and deliberately a member of neither fixture region. */
let appAdmin: SeedUser
/** `region_admin` in HOME. Founds both regions, so `regions.created_by` has somebody. */
let owner: SeedUser
/** `region_user` in HOME. */
let member: SeedUser
/** A member of neither region, and not an app admin. */
let outsider: SeedUser

let homeRegionId = 0
let otherRegionId = 0
let quietRegionId = 0

beforeAll(async () => {
  if (!reachable) return

  const users = await seedUsers({
    appAdmin: 'admin@grnyte.rocks',
    member: 'user@grnyte.rocks',
    owner: 'maintainer@grnyte.rocks',
  })
  appAdmin = users.appAdmin
  member = users.member
  owner = users.owner
  outsider = await createThrowawayUser('region-stats-outsider')

  const [home] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${HOME}, ${owner.userId}, 25) returning id`
  const [other] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${OTHER}, ${owner.userId}) returning id`
  const [quiet] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by) values (${QUIET}, ${owner.userId}) returning id`
  homeRegionId = home.id
  otherRegionId = other.id
  quietRegionId = quiet.id

  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${homeRegionId}, ${owner.userId}, ${owner.authId}, 'region_admin', true),
      (${homeRegionId}, ${member.userId}, ${member.authId}, 'region_user', true),
      (${otherRegionId}, ${owner.userId}, ${owner.authId}, 'region_admin', true),
      (${quietRegionId}, ${owner.userId}, ${owner.authId}, 'region_admin', true)`

  // Deactivated, so the split counts memberships rather than rows.
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${homeRegionId}, ${outsider.userId}, ${outsider.authId}, 'region_maintainer', false)`

  await sql`
    insert into public.region_invitations (region_fk, email, invited_by, token, status, expires_at) values
      (${homeRegionId}, '__stats_pending__@grnyte.test', ${owner.userId}, gen_random_uuid(), 'pending', now() + interval '7 days'),
      (${homeRegionId}, '__stats_accepted__@grnyte.test', ${owner.userId}, gen_random_uuid(), 'accepted', now() + interval '7 days')`

  // One sector and one still-untyped area: `sectors` counts the typed ones.
  const [sector] = await sql<{ id: number }[]>`
    insert into public.areas (name, type, region_fk, created_by)
    values ('__stats_sector__', 'sector', ${homeRegionId}, ${owner.userId}) returning id`
  await sql`
    insert into public.areas (name, region_fk, created_by) values ('__stats_untyped__', ${homeRegionId}, ${owner.userId})`
  await sql`
    insert into public.areas (name, type, region_fk, created_by, deleted_at)
    values ('__stats_gone_sector__', 'sector', ${homeRegionId}, ${owner.userId}, now())`

  const [block] = await sql<{ id: number }[]>`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order")
    values ('__stats_block__', ${sector.id}, ${homeRegionId}, ${owner.userId}, 0) returning id`
  // One block on the map and one off it, so the "without coordinates" count is not every block.
  const [pin] = await sql<{ id: number }[]>`
    insert into public.geolocations (lat, long, region_fk) values (50.1, 8.1, ${homeRegionId}) returning id`
  await sql`
    insert into public.blocks (name, area_fk, region_fk, created_by, "order", geolocation_fk)
    values ('__stats_block_pinned__', ${sector.id}, ${homeRegionId}, ${owner.userId}, 1, ${pin.id})`

  const [grade, harder] = await sql<{ id: number }[]>`select id from public.grades order by id limit 2`

  const [route] = await sql<{ id: number }[]>`
    insert into public.routes (name, block_fk, region_fk, created_by, user_grade_fk)
    values ('__stats_route__', ${block.id}, ${homeRegionId}, ${owner.userId}, ${grade.id}) returning id`
  await sql`
    insert into public.routes (name, block_fk, region_fk, created_by, user_grade_fk) values
      ('__stats_route_2__', ${block.id}, ${homeRegionId}, ${owner.userId}, ${harder.id}),
      ('__stats_route_ungraded__', ${block.id}, ${homeRegionId}, ${owner.userId}, null)`
  // Soft-deleted, and graded: it must fall out of both the route count and the histogram.
  await sql`
    insert into public.routes (name, block_fk, region_fk, created_by, user_grade_fk, deleted_at)
    values ('__stats_route_gone__', ${block.id}, ${homeRegionId}, ${owner.userId}, ${grade.id}, now())`

  // A topo with one drawn line and one erased row: only the drawn one counts as covered.
  const [topo] = await sql<{ id: number }[]>`
    insert into public.topos (block_fk, region_fk) values (${block.id}, ${homeRegionId}) returning id`
  await sql`
    insert into public.topo_routes (region_fk, topo_fk, route_fk, path, top_type)
    values (${homeRegionId}, ${topo.id}, ${route.id}, 'M0 0', 'top')`
  await sql`
    insert into public.topo_routes (region_fk, topo_fk, route_fk, path, top_type)
    values (${homeRegionId}, ${topo.id}, (select id from public.routes where name = '__stats_route_2__'), null, 'top')`

  await sql`
    insert into public.ascents (region_fk, route_fk, created_by, date_time, type) values
      (${homeRegionId}, ${route.id}, ${member.userId}, '2026-08-01', 'flash'),
      (${homeRegionId}, ${route.id}, ${owner.userId}, '2026-08-02', 'attempt')`
  await sql`
    insert into public.ascents (region_fk, route_fk, created_by, date_time, type, deleted_at)
    values (${homeRegionId}, ${route.id}, ${owner.userId}, '2026-08-03', 'repeat', now())`

  // `files.id` is a cuid2 minted in TypeScript, not a column default, so raw SQL supplies one.
  const [video] = await sql<{ id: string }[]>`
    insert into public.files (id, region_fk, created_by, path, route_fk)
    values ('__stats_video__', ${homeRegionId}, ${owner.userId}, '', ${route.id}) returning id`
  await sql`
    insert into public.bunny_streams (id, region_fk, file_fk) values (gen_random_uuid(), ${homeRegionId}, ${video.id})`
  await sql`
    update public.files set bunny_stream_fk = (select id from public.bunny_streams where file_fk = ${video.id})
    where id = ${video.id}`
  await sql`
    insert into public.files (id, region_fk, created_by, path, route_fk) values
      ('__stats_photo_a__', ${homeRegionId}, ${owner.userId}, '__stats_photo_a__.jpg', ${route.id}),
      ('__stats_photo_b__', ${homeRegionId}, ${owner.userId}, '__stats_photo_b__.jpg', ${route.id})`
  // An orphaned ex-video: `deleteFileRows` nulls the stream FK before a delete RLS can refuse, so
  // the row survives with no stream and an empty path. It is not a photo.
  await sql`
    insert into public.files (id, region_fk, created_by, path, route_fk)
    values ('__stats_orphan__', ${homeRegionId}, ${owner.userId}, '', ${route.id})`

  // Two this month, one last month, one far outside the window. Pinned to the 2nd of the month
  // rather than `now() - 2 days`, which lands in the PREVIOUS bucket when the suite runs on the
  // 1st. OTHER is inserted after HOME and made the most recently active, so the list's sort has
  // to contradict insertion order: unsorted, the rows come back home-first.
  await sql`
    insert into public.events (region_fk, actor_fk, verb, route_fk, created_at) values
      (${homeRegionId}, ${owner.userId}, 'create', ${route.id}, date_trunc('month', now()) + interval '1 day'),
      (${homeRegionId}, ${owner.userId}, 'update', ${route.id}, date_trunc('month', now()) + interval '1 day'),
      (${homeRegionId}, ${owner.userId}, 'update', ${route.id}, now() - interval '1 month'),
      (${homeRegionId}, ${owner.userId}, 'update', ${route.id}, now() - interval '5 years')`
  await sql`
    insert into public.events (region_fk, actor_fk, verb, subject_fk, created_at)
    values (${otherRegionId}, ${owner.userId}, 'join', ${owner.userId}, now())`
})

afterAll(async () => {
  if (reachable) {
    const ids = [homeRegionId, otherRegionId, quietRegionId]
    await sql`delete from public.events where region_fk in ${sql(ids)}`
    await sql`delete from public.topo_routes where region_fk in ${sql(ids)}`
    await sql`delete from public.topos where region_fk in ${sql(ids)}`
    await sql`update public.files set bunny_stream_fk = null where region_fk in ${sql(ids)}`
    await sql`delete from public.bunny_streams where region_fk in ${sql(ids)}`
    await sql`delete from public.files where region_fk in ${sql(ids)}`
    await sql`delete from public.ascents where region_fk in ${sql(ids)}`
    await sql`delete from public.routes where region_fk in ${sql(ids)}`
    await sql`update public.blocks set geolocation_fk = null where region_fk in ${sql(ids)}`
    await sql`delete from public.blocks where region_fk in ${sql(ids)}`
    await sql`delete from public.areas where region_fk in ${sql(ids)}`
    await sql`delete from public.geolocations where region_fk in ${sql(ids)}`
    await sql`delete from public.region_invitations where region_fk in ${sql(ids)}`
    await sql`delete from public.region_members where region_fk in ${sql(ids)}`
    await sql`delete from public.regions where id in ${sql(ids)}`
    await dropThrowawayUser(outsider)
  }
  await sql.end()
})

describe.skipIf(!reachable)('regionStats gate', () => {
  it('serves a member of the region', async () => {
    const stats = await asRequest(member.authId, () => regionStats({ regionFk: homeRegionId }))

    expect(stats.regionFk).toBe(homeRegionId)
    expect(stats.name).toBe(HOME)
  })

  it('serves an app admin a region they are a member of nothing in', async () => {
    const stats = await asRequest(appAdmin.authId, () => regionStats({ regionFk: homeRegionId }))

    expect(stats.routes).toBe(3)
  })

  it('refuses an account that is neither a member nor an app admin', async () => {
    const status = await statusOf(() => asRequest(outsider.authId, () => regionStats({ regionFk: homeRegionId })))

    expect(status).toBe(403)
  })

  it('refuses a member of another region', async () => {
    const status = await statusOf(() => asRequest(member.authId, () => regionStats({ regionFk: otherRegionId })))

    expect(status).toBe(403)
  })

  it('reads the member path under RLS, so a member sees the same numbers as the app admin', async () => {
    const [asMember, asAdmin] = await Promise.all([
      asRequest(member.authId, () => regionStats({ regionFk: homeRegionId })),
      asRequest(appAdmin.authId, () => regionStats({ regionFk: homeRegionId })),
    ])

    expect(asMember).toEqual(asAdmin)
  })
})

describe.skipIf(!reachable)('regionStats numbers', () => {
  const stats = () => asRequest(member.authId, () => regionStats({ regionFk: homeRegionId }))

  it('counts only typed sectors, and not a deleted one', async () => {
    expect((await stats()).sectors).toBe(1)
  })

  it('leaves soft-deleted routes and ascents out', async () => {
    const result = await stats()

    expect(result.routes).toBe(3)
    expect(result.ascents).toBe(2)
  })

  it('splits photos from videos, and counts an orphaned ex-video as neither', async () => {
    const result = await stats()

    // Three rows carry no stream, but one of them is an orphan with an empty path.
    expect(result.photos).toBe(2)
    expect(result.videos).toBe(1)
  })

  it('counts active memberships by role and ignores a deactivated one', async () => {
    const result = await stats()

    expect(result.members).toEqual({ region_admin: 1, region_maintainer: 0, region_user: 1 })
    expect(result.maxMembers).toBe(25)
  })

  it('counts blocks that have no coordinates, and not the pinned one', async () => {
    const result = await stats()

    expect(result.blocks).toBe(2)
    expect(result.blocksWithoutCoordinates).toBe(1)
  })

  it('counts routes with no drawn line, treating an erased one as undrawn', async () => {
    const result = await stats()

    // Three live routes, one of which carries a real path.
    expect(result.routesWithoutTopo).toBe(2)
  })

  it('counts distinct actors in the activity window, not events', async () => {
    const result = await stats()

    expect(result.contributors).toBe(1)
  })

  it('counts only pending invitations', async () => {
    expect((await stats()).pendingInvitations).toBe(1)
  })

  it('buckets routes by community grade and keeps the ungraded ones apart', async () => {
    const result = await stats()

    expect([...result.gradeCounts.values()]).toEqual([1, 1])
    expect(result.ungraded).toBe(1)
  })

  it('reports no last activity for a region nothing has happened in', async () => {
    // QUIET carries no events at all, which is the branch the page swaps the label for.
    const result = await asRequest(owner.authId, () => regionStats({ regionFk: quietRegionId }))

    expect(result.lastActivityAt).toBeUndefined()
    expect(result.createdAt).toBeGreaterThan(0)
  })

  it('404s a region id that does not exist, rather than an empty one', async () => {
    const status = await statusOf(() => asRequest(appAdmin.authId, () => regionStats({ regionFk: 987_654_321 })))

    expect(status).toBe(404)
  })

  it('reports the last activity and a full activity window', async () => {
    const result = await stats()

    expect(result.activityByMonth).toHaveLength(ACTIVITY_MONTHS)
    expect(result.activityByMonth.at(-1)?.count).toBe(2)
    // The newest HOME event sits on the 2nd of the current month, so assert that window rather
    // than a rolling one: `createdAt` is no use, the fixture creates the region after the event.
    const monthStartMs = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
    expect(result.lastActivityAt).toBeGreaterThan(monthStartMs)
    expect(result.lastActivityAt).toBeLessThanOrEqual(Date.now())
  })

  it('leaves an event older than the window out of the chart', async () => {
    const result = await stats()

    expect(result.activityByMonth.reduce((total, month) => total + month.count, 0)).toBe(3)
  })
})

describe.skipIf(!reachable)('listAllRegions', () => {
  it('serves an app admin every region, including ones they do not belong to', async () => {
    const rows = await asRequest(appAdmin.authId, () => listAllRegions())
    const names = rows.map((row) => row.name)

    expect(names).toContain(HOME)
    expect(names).toContain(OTHER)
  })

  it('carries the member count', async () => {
    const rows = await asRequest(appAdmin.authId, () => listAllRegions())

    expect(rows.find((row) => row.name === HOME)?.members).toBe(2)
  })

  it('sorts by last activity, and puts a region nothing happened in last', async () => {
    const rows = await asRequest(appAdmin.authId, () => listAllRegions())
    const home = rows.findIndex((row) => row.name === HOME)
    const other = rows.findIndex((row) => row.name === OTHER)
    const quiet = rows.findIndex((row) => row.name === QUIET)

    // OTHER is the newest despite being inserted after HOME, so an unsorted list fails here.
    expect(other).toBeGreaterThanOrEqual(0)
    expect(other).toBeLessThan(home)
    expect(home).toBeLessThan(quiet)
  })

  it('carries the last activity, and leaves it undefined where nothing happened', async () => {
    const rows = await asRequest(appAdmin.authId, () => listAllRegions())

    expect(rows.find((row) => row.name === HOME)?.lastActivityAt).toBeGreaterThan(0)
    expect(rows.find((row) => row.name === QUIET)?.lastActivityAt).toBeUndefined()
  })

  it('refuses a region admin who is not an app admin', async () => {
    const status = await statusOf(() => asRequest(owner.authId, () => listAllRegions()))

    expect(status).toBe(403)
  })
})
