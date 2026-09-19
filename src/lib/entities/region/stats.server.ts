/**
 * The SQL half of the region stats page. `stats.remote.ts` keeps the permission gate and decides
 * which handle to call these with; nothing here checks anybody.
 *
 * Every function takes its handle rather than reaching for one: a member is counted under RLS and
 * an app admin under the privileged pool, and a second copy of this SQL would be the copy that
 * forgets which it is.
 */
import * as schema from '$lib/db/schema'
import {
  areas,
  ascents,
  blocks,
  events,
  files,
  regionInvitations,
  regionMembers,
  regions,
  routes,
  topoRoutes,
} from '$lib/db/schema'
import { toDisplayName } from '$lib/entities/displayName'
import type { AssignableRole } from '$lib/entities/rolePermission/dto'
import type { Locale } from '$lib/paraglide/runtime'
import { and, count, countDistinct, eq, gte, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { activityMonths, activityWindowStart, emptyMemberSplit, type RegionStats, type RegionSummary } from './stats'

type Db = PostgresJsDatabase<typeof schema>

/** Postgres returns `bigint` as a string, so every epoch selection comes back through this. */
const millis = (value: null | number | string): number | undefined => (value == null ? undefined : Number(value))

/** The `count(*)` of `table`'s live rows in one region, as a scalar subquery.
 *  Bound to `regionFk` rather than correlated to `regions.id`: drizzle renders an interpolated
 *  column unqualified, so inside the subquery `id` resolves to that table's own. */
const scoped = (table: typeof areas | typeof ascents | typeof blocks | typeof routes, regionFk: number) =>
  sql<number>`(select count(*)::int from ${table} where ${table.regionFk} = ${regionFk} and ${table.deletedAt} is null)`

/** A region's numbers. Returns undefined when the handle cannot see the region at all. */
export async function collectRegionStats(
  db: Db,
  regionFk: number,
  locale: Locale,
  now: Date,
): Promise<RegionStats | undefined> {
  const [row] = await db
    .select({
      // `files` does not soft-delete, and a video is a row that carries a stream.
      ascents: scoped(ascents, regionFk),
      blocks: scoped(blocks, regionFk),
      blocksWithoutCoordinates: sql<number>`(
        select count(*)::int from ${blocks}
        where ${blocks.regionFk} = ${regionFk} and ${blocks.deletedAt} is null
          and ${blocks.geolocationFk} is null
      )`,
      createdAt: sql<string>`(extract(epoch from ${regions.createdAt}) * 1000)::bigint`,
      lastActivityAt: sql<null | string>`(
        select (extract(epoch from max(${events.createdAt})) * 1000)::bigint
        from ${events} where ${events.regionFk} = ${regionFk}
      )`,
      maxMembers: regions.maxMembers,
      name: regions.name,
      pendingInvitations: sql<number>`(
        select count(*)::int from ${regionInvitations}
        where ${regionInvitations.regionFk} = ${regionFk} and ${regionInvitations.status} = 'pending'
      )`,
      // `path <> ''` as well as the null stream: a video row's path is '' by schema, and
      // `deleteFileRows` nulls the stream FK before a delete RLS can still refuse.
      photos: sql<number>`(
        select count(*)::int from ${files}
        where ${files.regionFk} = ${regionFk} and ${files.bunnyStreamFk} is null and ${files.path} <> ''
      )`,
      routes: scoped(routes, regionFk),
      sectors: sql<number>`(
        select count(*)::int from ${areas}
        where ${areas.regionFk} = ${regionFk} and ${areas.deletedAt} is null and ${areas.type} = 'sector'
      )`,
      videos: sql<number>`(
        select count(*)::int from ${files}
        where ${files.regionFk} = ${regionFk} and ${files.bunnyStreamFk} is not null
      )`,
    })
    .from(regions)
    .where(eq(regions.id, regionFk))

  if (row == null) {
    return undefined
  }

  const [members, grades, activity, untopoed, contributors] = await Promise.all([
    memberSplit(db, regionFk),
    gradeCounts(db, regionFk),
    activityByMonth(db, regionFk, now),
    routesWithoutTopo(db, regionFk),
    contributorCount(db, regionFk, now),
  ])

  return {
    activityByMonth: activityMonths(activity, now),
    ascents: row.ascents,
    blocks: row.blocks,
    blocksWithoutCoordinates: row.blocksWithoutCoordinates,
    contributors,
    createdAt: Number(row.createdAt),
    gradeCounts: grades.counts,
    lastActivityAt: millis(row.lastActivityAt),
    maxMembers: row.maxMembers,
    members,
    name: toDisplayName(row.name, locale),
    pendingInvitations: row.pendingInvitations,
    photos: row.photos,
    regionFk,
    routes: row.routes,
    routesWithoutTopo: untopoed,
    sectors: row.sectors,
    ungraded: grades.ungraded,
    videos: row.videos,
  }
}

/** Every region with its member count and last activity, newest first. App-admin only; see the ADR. */
export async function collectRegionSummaries(db: Db, locale: Locale): Promise<RegionSummary[]> {
  // Three grouped reads joined here rather than correlated subqueries: one scan each, whatever the
  // region count, and no per-region round trip.
  const [rows, memberRows, activityRows] = await Promise.all([
    db.select({ id: regions.id, name: regions.name }).from(regions),
    db
      .select({ regionFk: regionMembers.regionFk, total: count() })
      .from(regionMembers)
      .where(eq(regionMembers.isActive, true))
      .groupBy(regionMembers.regionFk),
    db
      .select({
        last: sql<null | string>`(extract(epoch from max(${events.createdAt})) * 1000)::bigint`,
        regionFk: events.regionFk,
      })
      .from(events)
      .groupBy(events.regionFk),
  ])

  const members = new Map(memberRows.map((row) => [row.regionFk, row.total]))
  const activity = new Map(activityRows.map((row) => [row.regionFk, millis(row.last)]))

  return rows
    .map((row) => ({
      id: row.id,
      lastActivityAt: activity.get(row.id),
      members: members.get(row.id) ?? 0,
      name: toDisplayName(row.name, locale),
    }))
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0) || a.id - b.id)
}

async function activityByMonth(db: Db, regionFk: number, now: Date) {
  const month = sql<string>`(extract(epoch from (
    date_trunc('month', ${events.createdAt} at time zone 'UTC') at time zone 'UTC'
  )) * 1000)::bigint`

  const rows = await db
    .select({ month, total: count() })
    .from(events)
    .where(and(eq(events.regionFk, regionFk), gte(events.createdAt, new Date(activityWindowStart(now)))))
    .groupBy(month)

  return new Map(rows.map((row) => [Number(row.month), row.total]))
}

/** Distinct people who did anything inside the activity window. */
async function contributorCount(db: Db, regionFk: number, now: Date): Promise<number> {
  const [row] = await db
    .select({ value: countDistinct(events.actorFk) })
    .from(events)
    .where(and(eq(events.regionFk, regionFk), gte(events.createdAt, new Date(activityWindowStart(now)))))
  return row?.value ?? 0
}

async function gradeCounts(db: Db, regionFk: number) {
  const rows = await db
    .select({ gradeFk: routes.userGradeFk, total: count() })
    .from(routes)
    .where(and(eq(routes.regionFk, regionFk), isNull(routes.deletedAt)))
    .groupBy(routes.userGradeFk)

  const counts = new Map<number, number>()
  let ungraded = 0
  for (const row of rows) {
    if (row.gradeFk == null) {
      ungraded += row.total
    } else {
      counts.set(row.gradeFk, row.total)
    }
  }
  return { counts, ungraded }
}

async function memberSplit(db: Db, regionFk: number) {
  const rows = await db
    .select({ role: regionMembers.role, total: count() })
    .from(regionMembers)
    .where(and(eq(regionMembers.regionFk, regionFk), eq(regionMembers.isActive, true)))
    .groupBy(regionMembers.role)

  const split = emptyMemberSplit()
  for (const row of rows) {
    // `app_admin` is granted out of band and never sits in a region's member list, but the column
    // is the whole enum, so a stray row must not land a key the UI does not render.
    if (row.role in split) {
      split[row.role as AssignableRole] = row.total
    }
  }
  return split
}

/** Live routes with no drawn line. Through the builder, not a `sql` subquery: an interpolated
 *  column renders unqualified, so `routes.id` would resolve to the subquery's own table. */
async function routesWithoutTopo(db: Db, regionFk: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(routes)
    .where(
      and(
        eq(routes.regionFk, regionFk),
        isNull(routes.deletedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(topoRoutes)
            .where(and(eq(topoRoutes.routeFk, routes.id), isNotNull(topoRoutes.path))),
        ),
      ),
    )
  return row?.value ?? 0
}
