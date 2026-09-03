import * as schema from '$lib/db/schema'
import { ascents } from '$lib/db/schema'
import { and, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { deriveAccolade, parseAccolade, type AccoladeAscent } from './accolade'
import type { AscentType } from './dto'

type Db = PostgresJsDatabase<typeof schema>

/**
 * How far back the history query reaches.
 *
 * One day wider than the claim's own window, so a send dated slightly in the past still sees the
 * whole twelve months it is measured against rather than a window clipped to today.
 */
const HISTORY_DAYS = 366

/**
 * Bring this climber's claims back in step after any write to one of their ascents.
 *
 * The one entry point every ascent mutation calls, and it owns the whole protocol rather than
 * asking three call sites to remember it: whether to re-derive or to clear, and that a failure here
 * never fails the log.
 *
 * The branch is the load-bearing part. `db` is the CALLER's RLS-scoped connection, so re-deriving
 * as anybody but the climber judges them against the regions the caller can see. A maintainer may
 * edit somebody else's ascent, so their branch clears instead: a missing banner is a claim not
 * made, where a stale one is a false claim about somebody's climbing. That rule used to be a
 * duplicated `createdBy === user.id` ternary at each call site, and a fourth mutation that forgot
 * it would have written the wrong claim about a person's climbing with nothing to catch it.
 *
 * Best-effort by design: the claim is decoration on a card, a climber's ascent is not.
 */
export async function recordAccolades(
  db: Db,
  ascent: { createdBy: number; routeFk: number },
  actorFk: number,
): Promise<void> {
  const run = ascent.createdBy === actorFk ? syncAccolades : clearAccolades

  await run(db, ascent.createdBy, ascent.routeFk).catch(() => undefined)
}

/**
 * Drop every stored claim of this climber's that the write could have falsified.
 *
 * What a maintainer's edit gets instead of a recompute, for the reason `recordAccolades` gives.
 * Clearing is the safe direction: a missing banner is a claim not made, where a stale one is a
 * false claim about somebody's climbing. The climber's next write to the route derives it again.
 */
async function clearAccolades(db: Db, userFk: number, routeFk: number): Promise<void> {
  const rows = await loadTargets(db, userFk, routeFk)
  const ids = rows.filter((row) => row.accolade != null).map((row) => row.id)

  if (ids.length === 0) {
    return
  }

  // Every claim the edit could have falsified, not only this route's. A ceiling is measured across
  // the climber's routes, so a grade a maintainer changed here can make a banner false over there;
  // clearing only the edited route left exactly the cross-route hole `loadTargets` exists to close.
  await db
    .update(ascents)
    .set({ accolade: null })
    .where(and(eq(ascents.createdBy, userFk), inArray(ascents.id, ids)))
}

/**
 * The climber's own ascents a claim is measured against: everything they have logged on this
 * route, plus every send of theirs back to `from`.
 *
 * `from` is the oldest ascent a claim is being derived for, not today, because the window belongs
 * to the ascent rather than to the clock. Reading a day wider than the claim's own window so a
 * send dated slightly in the past still sees the whole twelve months it is judged against.
 *
 * One query for both halves. Indexed on `created_by` and on `route_fk`, and scoped to one person,
 * so it stays a small read even for somebody with thousands of ascents.
 */
async function loadHistory(db: Db, userFk: number, routeFk: number, from: number): Promise<AccoladeAscent[]> {
  const cutoff = new Date(from - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const rows = await db
    .select({
      dateTime: ascents.dateTime,
      gradeFk: ascents.gradeFk,
      id: ascents.id,
      routeFk: ascents.routeFk,
      type: ascents.type,
    })
    .from(ascents)
    .where(
      and(
        eq(ascents.createdBy, userFk),
        isNull(ascents.deletedAt),
        or(eq(ascents.routeFk, routeFk), gte(ascents.dateTime, cutoff)),
      ),
    )

  return rows.map(toAccoladeAscent)
}

/**
 * The rows a claim may be written to: this climber's ascents on this route, plus any CEILING claim
 * of theirs elsewhere.
 *
 * The second half is what keeps that claim honest across routes. A ceiling is measured against the
 * climber's whole twelve months rather than against one route, so correcting the grade of a
 * January ascent on route A can falsify a banner sitting on route B; targeting only the route being
 * written left B saying "Hardest of its kind" with something harder now inside its window. The
 * backfill already recomputes globally, so without this the two paths disagree and a migrate
 * silently flips banners on and off.
 *
 * Only ceilings. A project claim depends on nothing but its own route's attempts, so an edit
 * elsewhere cannot invalidate one, and re-deriving it here WOULD break it: `loadHistory` reaches
 * back a window rather than a whole route's run, so a project whose first attempts predate that
 * window would come back as "no claim" and lose a banner it had rightly earned.
 *
 * Bounded by "already carries a claim", so this stays a small read: the set of rows that could be
 * wrong, not every ascent the climber has ever logged.
 */
async function loadTargets(
  db: Db,
  userFk: number,
  routeFk: number,
): Promise<(AccoladeAscent & { accolade: null | string })[]> {
  const rows = await db
    .select({
      accolade: ascents.accolade,
      dateTime: ascents.dateTime,
      gradeFk: ascents.gradeFk,
      id: ascents.id,
      routeFk: ascents.routeFk,
      type: ascents.type,
    })
    .from(ascents)
    .where(
      and(
        eq(ascents.createdBy, userFk),
        isNull(ascents.deletedAt),
        or(eq(ascents.routeFk, routeFk), isNotNull(ascents.accolade)),
      ),
    )

  return rows
    .filter((row) => row.routeFk === routeFk || parseAccolade(row.accolade)?.kind === 'ceiling')
    .map((row) => ({ ...toAccoladeAscent(row), accolade: row.accolade }))
}

/**
 * Write the claim a climber's ascent on this route has earned, for that ascent and for the send it
 * may have changed.
 *
 * Two rows rather than one, because attempts are commonly logged AFTER the send they belong to:
 * somebody tops their project, then backfills the twenty sessions it took. Only recomputing the
 * row being written would leave that send with no banner forever, which is precisely the climber
 * the banner exists for. Deleting an attempt runs the same path for the same reason.
 *
 * Owner-scoped by construction: every row it touches is one of `userFk`'s own, which is the only
 * reason this can be a handler at all. `events` has no member UPDATE policy under RLS, so a claim
 * stored there could never be revised.
 *
 * Private, and reachable only through `recordAccolades`, which owns the one precondition this has:
 * it may run only as the climber, because `db` is the caller's RLS-scoped connection and reading
 * somebody else's history through it judges them against the regions the CALLER can see.
 */
async function syncAccolades(db: Db, userFk: number, routeFk: number): Promise<void> {
  // Every row on the route, attempts included. An attempt derives to no claim, so re-deriving one
  // costs nothing and is the only thing that CLEARS a stored claim when a send is corrected to an
  // attempt: filtering to sends here left that row wearing "Hardest of its kind" under a card
  // reading "attempted".
  const candidates = await loadTargets(db, userFk, routeFk)
  const onRoute = candidates.filter((target) => target.routeFk === routeFk)

  if (onRoute.length === 0) {
    return
  }

  // The window every target is measured in, not the window around today. A claim is made as of the
  // ascent's OWN date, so recomputing a 2024 send (which a note edit does) against the last twelve
  // months would find nothing from its era, derive no claim, and overwrite the stored one with
  // null. The oldest ROW ON THIS ROUTE sets how far back the history has to reach.
  //
  // Deliberately not the oldest of every target: an off-route claim can be years old, and anchoring
  // on it would make one stale banner turn every ascent this climber logs into a read of their
  // whole history since then.
  const oldest = Math.min(...onRoute.map((target) => target.dateTime ?? Date.now()))
  const history = await loadHistory(db, userFk, routeFk, oldest)

  // An off-route ceiling is only re-answerable if its own twelve months sit inside what was
  // loaded; older ones are left exactly as they are, since nothing in this read could tell us
  // whether they are still true.
  const targets = candidates.filter((target) => target.routeFk === routeFk || (target.dateTime ?? 0) >= oldest)

  for (const target of targets) {
    // Coverage declared, not decided here: only the route being written was read whole, so only
    // its rows may be asked for a project claim. `deriveAccolade` refuses one for the rest rather
    // than inventing a run out of whichever attempts happened to fall inside the window.
    const accolade = deriveAccolade(target, {
      onRoute: target.routeFk === routeFk ? onRoute : undefined,
      window: history,
    })
    const next = accolade == null ? null : JSON.stringify(accolade)

    // Only when it moved. Without this every ascent on the route is rewritten on every
    // save, which churns the rows Zero replicates for no change a reader could see.
    if (next === (target.accolade ?? null)) {
      continue
    }

    await db
      .update(ascents)
      .set({ accolade: next })
      .where(and(eq(ascents.id, target.id), eq(ascents.createdBy, userFk)))
  }
}

/**
 * A stored row as the pure derivation reads it.
 *
 * The date conversion is the load-bearing part: a pg `date` reaches the Zero client as UTC-midnight
 * millis and the derivation compares climb days by equality, so reading it any other way here would
 * make the server and the client disagree about which two ascents happened on the same day.
 */
function toAccoladeAscent(row: {
  dateTime: null | string
  gradeFk: null | number
  id: number
  routeFk: number
  type: AscentType
}): AccoladeAscent {
  return {
    dateTime: row.dateTime == null ? undefined : new Date(row.dateTime).getTime(),
    gradeFk: row.gradeFk ?? undefined,
    id: row.id,
    routeFk: row.routeFk,
    type: row.type,
  }
}
