import { activities } from '$lib/db/schema'
import { authedQuery } from '$lib/remote/authed.server'
import { and, count, eq, inArray } from 'drizzle-orm'
import z from 'zod'

/**
 * How many contributions to the crag database (areas, blocks and routes the user
 * created, edited or removed) a user has. Ascent and file activity is excluded on
 * purpose: those aren't crag data edits. RLS-scoped, so it counts only what the
 * viewer is allowed to read.
 */
export const userContributionCount = authedQuery(z.number(), async (userId, { db }) => {
  const [row] = await db
    .select({ value: count() })
    .from(activities)
    .where(and(eq(activities.userFk, userId), inArray(activities.entityType, ['area', 'block', 'route'])))
  return row?.value ?? 0
})
