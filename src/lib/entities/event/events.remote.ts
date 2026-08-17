import { events } from '$lib/db/schema'
import { authedQuery } from '$lib/remote/authed.server'
import { and, count, eq, isNotNull, or } from 'drizzle-orm'
import z from 'zod'

/**
 * How many contributions to the crag database (areas, blocks and routes the user created, edited
 * or removed) a user has.
 *
 * Ascents and media are deliberately out: those are a climber's own log, not crag data. Off the
 * three object columns now rather than off a polymorphic `entity_type`, which is the same question
 * asked of a shape that can answer it.
 *
 * RLS-scoped, so it counts only what the viewer is allowed to read.
 */
export const userContributionCount = authedQuery(z.number(), async (userId, { db }) => {
  const [row] = await db
    .select({ value: count() })
    .from(events)
    .where(
      and(
        eq(events.actorFk, userId),
        or(isNotNull(events.areaFk), isNotNull(events.blockFk), isNotNull(events.routeFk)),
      ),
    )
  return row?.value ?? 0
})
