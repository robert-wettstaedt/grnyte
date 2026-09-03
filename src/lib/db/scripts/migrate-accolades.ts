/**
 * Fill `ascents.accolade` for sends logged before the column existed.
 *
 * Without this every card on a freshly migrated database is claimless, and stays that way: the
 * claim is written when an ascent is logged, so history never gains one on its own. That matters
 * most right after the v2 cutover, when the feed is showing imported events almost exclusively.
 *
 * Each send is judged AS OF ITS OWN DATE, against only what the climber had logged by then. That
 * is the same thing the write path stores and the same thing the claim means: "as of the day they
 * sent it". Judging history against today would hand banners to sends that were nothing special at
 * the time and quietly withhold them from the ones that were.
 *
 * Runs as part of `npm run migrate` (via `migrate.ts`). Idempotent: it recomputes every send and
 * writes only the rows whose stored value changes, so a second run is a no-op.
 */
import { asc, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deriveAccolade, type AccoladeAscent } from '../../entities/ascent/accolade'
import * as schema from '../schema'

export const migrate = async (db: PostgresJsDatabase<typeof schema>) => {
  const rows = await db
    .select({
      accolade: schema.ascents.accolade,
      createdBy: schema.ascents.createdBy,
      dateTime: schema.ascents.dateTime,
      gradeFk: schema.ascents.gradeFk,
      id: schema.ascents.id,
      routeFk: schema.ascents.routeFk,
      type: schema.ascents.type,
    })
    .from(schema.ascents)
    .where(isNull(schema.ascents.deletedAt))
    .orderBy(asc(schema.ascents.createdBy), asc(schema.ascents.dateTime), asc(schema.ascents.id))

  // Per climber, because every claim is measured against that person's own history and nobody
  // else's. One pass over a sorted list rather than a query per ascent: a region's whole logbook
  // is a few thousand rows, and this runs on every migrate.
  const byClimber = new Map<number, typeof rows>()
  for (const row of rows) {
    const list = byClimber.get(row.createdBy)
    if (list == null) {
      byClimber.set(row.createdBy, [row])
    } else {
      list.push(row)
    }
  }

  let written = 0

  for (const climb of byClimber.values()) {
    const history: AccoladeAscent[] = climb.map((row) => ({
      // A pg `date` compared as UTC-midnight millis, exactly as the client reads it, so the
      // backfill and the live write path cannot disagree about which day an ascent happened on.
      dateTime: row.dateTime == null ? undefined : new Date(row.dateTime).getTime(),
      gradeFk: row.gradeFk ?? undefined,
      id: row.id,
      routeFk: row.routeFk,
      type: row.type,
    }))

    for (const [index, row] of climb.entries()) {
      // Only what this climber had logged by the time of this send, sliced BY DATE rather than by
      // position. `date_time` is day-granular, so an index prefix hides the same-day siblings that
      // `ceiling` counts with `other.dateTime <= sent`: four sends of rising grade on one afternoon
      // were each judged against a different subset, so the backfill stored four "hardest of its
      // kind" claims where the write path stores one, and the next write revoked three of them.
      // Read off `history`, not off `row`: the raw column is a date STRING and only the mapped
      // shape carries the millis the derivation compares.
      const target = history[index]
      const sent = target.dateTime ?? 0
      const asOfThen = history.filter((other) => (other.dateTime ?? 0) <= sent)
      // The backfill reads every ascent this climber has, so its history covers the route's whole
      // run and it may ask for both claims. The live path cannot always say that, which is why
      // coverage is declared rather than assumed.
      const accolade = deriveAccolade(target, {
        onRoute: asOfThen.filter((other) => other.routeFk === target.routeFk),
        window: asOfThen,
      })
      const next = accolade == null ? null : JSON.stringify(accolade)

      if (next !== (row.accolade ?? null)) {
        await db.update(schema.ascents).set({ accolade: next }).where(eq(schema.ascents.id, row.id))
        written += 1
      }
    }
  }

  console.log(`\nfilled ${written} of ${rows.length} ascent accolade(s).`)
}
