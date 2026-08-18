/**
 * Resolving submitted first-ascensionist climbers to `firstAscensionists` rows, split out of
 * `routes.remote.ts` so it can be imported from a test (a `.remote.ts` module cannot). DB-backed:
 * it reads and writes the region's climber list.
 */
import * as schema from '$lib/db/schema'
import { firstAscensionists } from '$lib/db/schema'
import { insertEvent } from '$lib/entities/event/event.server'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/** A submitted climber: a free-text name, optionally claiming a user account. */
export interface FaClimber {
  name: string
  userFk?: null | number
}

type Db = PostgresJsDatabase<typeof schema>

/**
 * Resolve each submitted climber to a `firstAscensionists` row, matching an existing row by linked
 * user or (case-insensitive) name within the region, creating missing ones. Duplicate submissions
 * of the same climber collapse to one row.
 *
 * Self-claim only (mirrors v1): a climber may be bound to a user ACCOUNT only by that user, because
 * a linked FA surfaces on the account's profile and stats. A `userFk` in the payload that is not the
 * caller's own is ignored, so an editor curating history can name any first ascensionist but cannot
 * attribute one to someone else's account. Existing user-linked rows still match by name, so editing
 * a route preserves their link.
 */
export async function resolveFirstAscensionists(
  db: Db,
  climbers: FaClimber[],
  regionFk: number,
  callerUserFk: number,
): Promise<{ id: number; name: string }[]> {
  const existing = await db.query.firstAscensionists.findMany({
    where: eq(firstAscensionists.regionFk, regionFk),
  })

  const resolved: { id: number; name: string }[] = []
  for (const climber of climbers) {
    const claimedUserFk = climber.userFk === callerUserFk ? callerUserFk : null
    const match =
      (claimedUserFk == null ? undefined : existing.find((row) => row.userFk === claimedUserFk)) ??
      existing.find((row) => row.name.toLowerCase() === climber.name.toLowerCase())

    if (match != null) {
      if (!resolved.some((row) => row.id === match.id)) {
        resolved.push(match)
      }
      continue
    }

    const [created] = await db
      .insert(firstAscensionists)
      .values({ name: climber.name, regionFk, userFk: claimedUserFk })
      .returning()

    // A claim binds an account to a climbing identity: it shows on the profile and feeds the
    // stats, and it happens once ever, since every later edit matches the row that exists now.
    // Worth its own row despite the route event alongside it, which records a different
    // thing (the route's history changed, not who somebody is).
    if (claimedUserFk != null) {
      await insertEvent(db, {
        actorFk: claimedUserFk,
        metadata: created.name,
        object: { id: claimedUserFk, type: 'user' },
        regionFk,
        verb: 'add',
      })
    }

    existing.push(created)
    resolved.push(created)
  }
  return resolved
}
