import { events } from '$lib/db/schema'
import { readableRegionIds } from '$lib/entities/region/permissions'
import { authedQuery } from '$lib/remote/authed.server'
import { and, count, eq, inArray, isNotNull, or } from 'drizzle-orm'
import z from 'zod'

/**
 * How many contributions to the crag database (areas, blocks and routes the user created, edited
 * or removed) a user has.
 *
 * Ascents and media are deliberately out: those are a climber's own log, not crag data. Off the
 * three object columns now rather than off a polymorphic `entity_type`, which is the same question
 * asked of a shape that can answer it.
 *
 * Counted over the regions the CALLER may read, never the subject's, so two viewers legitimately see
 * two different numbers for the same person. The region predicate is the handler's own rather than a
 * policy's: RLS here answers only whether a caller may touch a region's rows, and an aggregate that
 * leans on it silently returns whatever the policy happened to allow.
 */
export const userContributionCount = authedQuery(z.number(), async (userId, { db, userRegions }) => {
  const regionFks = readableRegionIds(userRegions)

  // Drizzle renders `inArray(x, [])` as `false`, but only after building the query; short-circuit so
  // a caller who belongs to nowhere never reaches the database at all.
  if (regionFks.length === 0) {
    return 0
  }

  const [row] = await db
    .select({ value: count() })
    .from(events)
    .where(
      and(
        eq(events.actorFk, userId),
        inArray(events.regionFk, regionFks),
        or(isNotNull(events.areaFk), isNotNull(events.blockFk), isNotNull(events.routeFk)),
      ),
    )
  return row?.value ?? 0
})
