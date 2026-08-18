import { activities } from '$lib/db/schema'
import { readableRegionIds } from '$lib/entities/region/permissions'
import { authedQuery } from '$lib/remote/authed.server'
import { and, count, eq, inArray } from 'drizzle-orm'
import z from 'zod'

/**
 * How many contributions to the crag database (areas, blocks and routes the user
 * created, edited or removed) a user has. Ascent and file activity is excluded on
 * purpose: those aren't crag data edits.
 *
 * Counted over the regions the CALLER may read, never the subject's. Two viewers therefore see two
 * different numbers on the same profile, and that is the intended reading: "what you can see this
 * person has done here", not a global score.
 *
 * That sentence used to be true only because of the `region.read can read activities` policy, which
 * made this the one aggregate here whose answer was decided outside the file that returns it: the
 * statement as written asks for every activity row on the installation. Spelled out, the number
 * means the same thing whether or not the read happens to be running inside an RLS transaction,
 * instead of silently turning into "how much does this person contribute in regions you cannot
 * open" the day it does not.
 */
export const userContributionCount = authedQuery(z.number(), async (userId, { db, userRegions }) => {
  const regionFks = readableRegionIds(userRegions)

  // A caller who belongs to no region yet, the state every account starts in. Guarded rather than
  // handed to `inArray`: drizzle 0.45 compiles an empty list to `false`, which is the right answer
  // by accident, and that helper has thrown on an empty array in other versions. One line makes the
  // zero deliberate, survives a dependency bump, and skips a round trip that can only return 0.
  if (regionFks.length === 0) {
    return 0
  }

  const [row] = await db
    .select({ value: count() })
    .from(activities)
    .where(
      and(
        eq(activities.userFk, userId),
        inArray(activities.entityType, ['area', 'block', 'route']),
        inArray(activities.regionFk, regionFks),
      ),
    )
  return row?.value ?? 0
})
