/**
 * One-time repair: put the points of a legacy line back into the order it was CLIMBED.
 *
 * v1 never stored a meaningful order. Its writer sorted the points geometrically before
 * serializing (starts first, then middles by ascending `x + y`, then the top), and its viewer
 * threw that order away again, rebuilding the line with a nearest-neighbour walk from the centre
 * of the start holds. Nothing read the column's order, so nothing noticed it was a diagonal sweep.
 *
 * v2's `buildLine` connects the points in stored order, so every migrated line with two or more
 * middles now draws the sweep: zigzags and self-crossing loops that were never on the rock.
 * Proven on topo_route 1843, whose three middles are in exact ascending `x + y`.
 *
 * The repair is v1's own walk, applied once to the stored rows, so a repaired line is the line the
 * old viewer drew and is indistinguishable from one drawn in v2 today.
 *
 * Run `migrate-topo-paths` FIRST. A row it has not converted is still in pixels; this script reads
 * it correctly either way, but the row renders off-photo until it is normalized, so reordering one
 * on its own fixes an order nobody can see.
 *
 * DRY RUN by default, and the plan and its revert are written BEFORE any UPDATE.
 *   CONFIRM=true   apply
 *   TOPO_ID=1123   limit to one topo
 *   SKIP_IDS=1,2   leave these rows alone
 */
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import Database from 'postgres'
import drizzleConfig from '../../../../drizzle.config'
import { diffTopoLines, parseTopoChange, parseTopoLines } from '../../entities/topo/change'
import type { TopoPoint } from '../../entities/topo/dto'
import { centroid, isNormalized, parsePathTokens, serializePoints, type PathToken } from '../../entities/topo/path'
import * as schema from '../schema'
import { selectTopoPathRows } from './migrate-topo-paths'

if (process.argv.length > 2) {
  throw new Error(
    `fix-topo-point-order: unexpected argument(s) ${process.argv.slice(2).join(' ')}. This script is a DRY RUN by default; set CONFIRM=true to commit.`,
  )
}

const CONFIRM = process.env.CONFIRM === 'true'
const TOPO_ID = process.env.TOPO_ID == null ? undefined : asRowId('TOPO_ID', process.env.TOPO_ID)
const SKIP_IDS = new Set(
  (process.env.SKIP_IDS ?? '')
    .split(',')
    .filter(Boolean)
    .map((value) => asRowId('SKIP_IDS', value)),
)
/** Dump one skip bucket in full however big it is, e.g. `SHOW=not-legacy`. */
const SHOW = process.env.SHOW

/**
 * A row id off the environment. A typo used to become `NaN`, match nothing, and print
 * "0 path(s) would be reordered" as though the data were already clean.
 */
export function asRowId(name: string, value: string): number {
  const id = Number(value)
  // Positive, because these are serials and `Number('')` is a perfectly good 0 that matches no row.
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${name}: "${value}" is not a row id, so this run would silently match nothing.`)
  }
  return id
}

/** Tokens to typed points, by the rule both parsers use: a `Z` next makes the point before it the
 *  top, otherwise the letter decides. */
const toPoints = (tokens: PathToken[]): TopoPoint[] =>
  tokens.flatMap((token, index) =>
    token === 'Z'
      ? []
      : [
          {
            id: String(index),
            type:
              tokens[index + 1] === 'Z'
                ? ('top' as const)
                : token.letter === 'M'
                  ? ('start' as const)
                  : ('middle' as const),
            x: token.x,
            y: token.y,
          },
        ],
  )

/**
 * Undo the normalization: back to the pixels v1 sorted and measured in. Both halves below need it,
 * and neither survives without it, because `migrate-topo-paths` divided x and y by DIFFERENT
 * numbers. That is not a similarity transform, so it preserves neither v1's `x + y` order nor the
 * distances its walk compared. On a 4032x3024 photo it tilts every one of them.
 */
const toPixels = (point: { x: number; y: number }, size: Size) => ({
  x: point.x * size.width,
  y: point.y * size.height,
})

/** The image a path was drawn on. Required: without it nothing below can be read in v1's terms. */
export interface Size {
  height: number
  width: number
}

/**
 * The frame to read a path in. Normalized paths are scaled back up; a path `migrate-topo-paths`
 * could not convert is STILL in the pixels v1 drew it in, so scaling it again would be the same
 * anisotropic distortion a second time. Gated on the heuristic the renderer gates on, which is what
 * guarantees this module and `buildLine` read a given row the same way.
 */
const frameFor = (points: TopoPoint[], size: Size): Size => (isNormalized(points) ? size : { height: 1, width: 1 })

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Whether a path's waypoints are still in v1's writer order: ascending `x + y` of the original
 * pixels. That is the only shape the startless reversal is meaningful on.
 */
const isSweep = (points: TopoPoint[], frame: Size): boolean => {
  const keys = points
    .filter((point) => point.type === 'middle')
    .map((point) => {
      const pixel = toPixels(point, frame)
      return pixel.x + pixel.y
    })
  return keys.every((key, index) => index === 0 || keys[index - 1] <= key)
}

/**
 * v1's nearest-neighbour walk, reproduced: seed at the centre of the start holds, repeatedly take
 * the closest middle not yet visited, then the top. Distances are compared in pixels, which is
 * where v1 compared them: on a 4:3 photo a fraction of the height is not a fraction of the width,
 * so the same two candidates swap rank between the two spaces. The starts keep their stored order
 * because `buildLine` only ever averages them.
 */
export const orderPoints = (points: TopoPoint[], size: Size): TopoPoint[] => {
  const frame = frameFor(points, size)
  const starts = points.filter((point) => point.type === 'start')
  const top = points.find((point) => point.type === 'top')
  const unvisited = points.filter((point) => point.type === 'middle')

  const walked: TopoPoint[] = []

  // Where the walk begins. With start holds it is their centre: `buildLine`'s own centroid, not a
  // copy of it, because two averages are one edit away from disagreeing. With none, v1 began at the
  // first waypoint and consumed it, which is the branch these rows were always drawn through.
  let current: { x: number; y: number }
  if (starts.length > 0) {
    current = toPixels(centroid(starts), frame)
  } else if (unvisited.length > 0) {
    walked.push(...unvisited.splice(0, 1))
    current = toPixels(walked[0], frame)
  } else {
    return [...starts, ...(top == null ? [] : [top])]
  }

  while (unvisited.length > 0) {
    let nearest = 0
    for (let index = 1; index < unvisited.length; index++) {
      if (
        distance(current, toPixels(unvisited[index], frame)) < distance(current, toPixels(unvisited[nearest], frame))
      ) {
        nearest = index
      }
    }
    current = toPixels(unvisited[nearest], frame)
    walked.push(...unvisited.splice(nearest, 1))
  }

  // A startless walk begins at the sweep's first point, which on a vertical line is its TOP, so v1
  // reversed before appending the top and the line reads bottom-up. It reversed ONLY when there was
  // a top to append, which is why a startless traverse keeps the order it was walked in.
  //
  // And only on input that is STILL the sweep. The reversal makes this branch an involution rather
  // than idempotent: run it on its own output, where the seed is now the bottom hold, and it flips
  // the line back. `isLegacyOrder` used to stop that as a side effect of asking about provenance,
  // and removing it for provenance reasons took the idempotency guard with it. On a row already
  // walked, the NN chain from its first point IS its stored order, so skipping the reversal
  // returns it unchanged.
  const ordered = starts.length === 0 && top != null && isSweep(points, frame) ? walked.reverse() : walked

  return [...starts, ...ordered, ...(top == null ? [] : [top])]
}

/**
 * Rewrite one stored path in climbed order. `null` with a reason when the row must be left alone.
 *
 * Both refusals here are SAFETY, not provenance. Whether v1 or v2 wrote a row is answered by the
 * change rows in `editedInV2`, which name the lines a v2 save actually drew; an earlier version
 * asked the path's shape instead (starts first, middles in ascending `x + y`) as a proxy for the
 * same question, and that proxy refused 66 rows v1 had written and nobody had touched since.
 *
 * A path with no start hold is walked like any other. It used to be refused because
 * `serializePoints` opened the first token with an `M` whatever its type, so writing one back gave
 * it a hold it never had. That was a bug in the writer, now fixed, not a property of the data:
 * these rows were drawn startless and the backups show they always were.
 *
 * - `multiple-tops`: more than one point is typed `top`, and `orderPoints` carries only the first,
 *   so walking it would silently drop the rest.
 *
 * Nothing is short-circuited on a COUNT of points: the walk reports `already-ordered` itself.
 */
export const reorderPath = (
  path: string,
  size: Size,
): { next: null; reason: 'already-ordered' | 'multiple-tops' | 'unparsable' } | { next: string } => {
  const tokens = parsePathTokens(path)
  if (tokens == null || tokens.length === 0) {
    return { next: null, reason: 'unparsable' }
  }

  const points = toPoints(tokens)
  if (points.filter((point) => point.type === 'top').length > 1) {
    return { next: null, reason: 'multiple-tops' }
  }

  const next = serializePoints(orderPoints(points, size))
  return next === serializePoints(points) ? { next: null, reason: 'already-ordered' } : { next }
}

/** Host and database of a connection string, for the banner. Never the user or the password. */
export const describeTarget = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`
  } catch {
    return '<unparseable DATABASE_URL>'
  }
}

/**
 * What a v2 save has already drawn, as narrowly as the record allows.
 *
 * `routes` holds the lines a v2 save demonstrably ADDED or REDREW, read off the change rows the
 * save wrote. Those are in real drawn order and must never be walked.
 *
 * `topos` is the fallback: a photo carrying a lines event whose change rows cannot be read at all.
 * There is no way to tell which of its lines moved, so the whole photo is protected.
 *
 * The distinction matters because `saveTopoLines` records every line the photo carried after an
 * edit, touched or not. Protecting the photo rather than the line means one v2 save on one line
 * freezes every v1 line beside it: on topo 982 that left four untouched legacy lines looped.
 *
 * A missing `events` table is fatal on purpose. Reading it as "nothing was edited" would hand the
 * walk every line v2 users have drawn by hand since the cutover.
 */
export interface EditedInV2 {
  routes: Set<number>
  topos: Set<number>
}

export const editedInV2 = async (db: PostgresJsDatabase<typeof schema>): Promise<EditedInV2> => {
  // This guard is the only thing standing between a v2-drawn line and the walk, so an unreadable
  // `events` table must stop the run rather than read as "nothing was edited in v2". Rethrown with
  // the connection named, because a bare 42P01 looks like a bug in this script rather than a
  // DATABASE_URL pointing somewhere else.
  const rows = await db
    .select({
      metadata: schema.events.metadata,
      newValue: schema.changes.newValue,
      oldValue: schema.changes.oldValue,
    })
    .from(schema.events)
    .leftJoin(schema.changes, and(eq(schema.changes.eventFk, schema.events.id), eq(schema.changes.columnName, 'topo')))
    .where(isNotNull(schema.events.metadata))
    .catch((cause: unknown) => {
      throw new Error(
        'could not read `events`/`changes`, so there is no way to tell which lines v2 has already ' +
          `drawn: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      )
    })

  return collectEditedInV2(rows)
}

/** One `events` row with its topo change row, as {@link editedInV2} reads it. */
export interface TopoEventRow {
  metadata: null | string
  newValue: null | string
  oldValue: null | string
}

/**
 * Whether a path still holds v1's pixels, which the renderer draws off-photo. Via the strict parser,
 * because `convertPathToPoints` returns `[]` for anything it cannot read and `isNormalized([])` is
 * false, so an unparsable row was reported as pixel-space too. The POINT count is what matters, not
 * the token count: a lone `Z` parses to one token and no points.
 */
export const looksLikePixels = (path: string): boolean => {
  const parsed = parsePathTokens(path)
  if (parsed == null) {
    return false
  }
  const points = toPoints(parsed)
  return points.length > 0 && !isNormalized(points)
}

/** Whether a change value tells us nothing: absent, empty, or holding only entries that will not
 *  parse. `parseTopoLines` drops what it cannot read, so unreadable and "no lines" look alike. */
const unreadable = (value: null | string | undefined): boolean =>
  value == null || value === '' || parseTopoLines(value).length === 0

/** The pure half of {@link editedInV2}: what these rows say v2 has drawn. */
export const collectEditedInV2 = (rows: readonly TopoEventRow[]): EditedInV2 => {
  const routes = new Set<number>()
  const topos = new Set<number>()

  for (const row of rows) {
    const change = parseTopoChange(row.metadata)
    if (change?.action !== 'lines' || change.topoId == null) {
      continue
    }

    // The event says this photo was saved. If EITHER side is unreadable it does not also say which
    // lines moved, and the whole photo is protected. Either, not both: an unreadable `newValue`
    // beside a readable `oldValue` puts every line in `removed`, leaving `added` and `redrawn`
    // empty, so nothing at all would be protected. Unreadable is not only null, since a value that
    // parses to no entries reads as "nothing changed".
    if (unreadable(row.oldValue) || unreadable(row.newValue)) {
      topos.add(change.topoId)
      continue
    }

    const diff = diffTopoLines(row.oldValue, row.newValue)
    for (const line of [...diff.added, ...diff.redrawn]) {
      routes.add(line.routeFk)
    }
  }

  return { routes, topos }
}

export const migrate = async (db: PostgresJsDatabase<typeof schema>, { dryRun = true }: { dryRun?: boolean } = {}) => {
  const edited = await editedInV2(db)
  console.log(
    `v2 has drawn ${edited.routes.size} line(s) by hand; ${edited.topos.size} photo(s) are protected whole ` +
      'because their change rows could not be read',
  )

  // The same join `migrate-topo-paths` walks, because the image size is not optional here: a row
  // whose photo has no stored dimensions cannot be read back into the pixels v1 sorted in.
  const rows = await selectTopoPathRows(db)

  // The join is inner, so a line whose topo or file row is gone drops out of it silently. Counted
  // against the raw table, because "not in the plan" and "never looked at" are different answers.
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.topoRoutes)
    .where(isNotNull(schema.topoRoutes.path))
  if (total > rows.length) {
    console.log(`${total - rows.length} row(s) have no topo or file row and were not examined`)
  }

  const plan: { after: string; before: string; id: number; route: null | number; size: string; topo: null | number }[] =
    []
  type Skipped = { id: number; path: string; route: null | number; size: string; topo: number }
  const skipped: Record<string, Skipped[]> = {}
  const skip = (reason: string, row: Skipped) => void (skipped[reason] ??= []).push(row)

  // A path `migrate-topo-paths` never converted is still in pixels, which the renderer draws at raw
  // pixel coordinates on a 0-1 canvas: the line lands nowhere near the photo. Reordering one is
  // correct but does not make it visible, so it is called out on its own.
  const stillPixels: number[] = []

  for (const row of rows) {
    if (row.path == null || row.path.trim() === '') {
      continue
    }
    if (TOPO_ID != null && row.topoId !== TOPO_ID) {
      continue
    }
    const detail: Skipped = {
      id: row.id,
      path: row.path,
      route: row.routeId,
      size: `${row.width}x${row.height}`,
      topo: row.topoId,
    }

    if (SKIP_IDS.has(row.id)) {
      skip('skipped by request', detail)
      continue
    }
    if (row.routeId != null && edited.routes.has(row.routeId)) {
      skip('drawn in v2', detail)
      continue
    }
    if (edited.topos.has(row.topoId)) {
      skip('photo edited in v2, change rows unreadable', detail)
      continue
    }
    if (row.width == null || row.height == null || row.width <= 0 || row.height <= 0) {
      skip('no dimensions', detail)
      continue
    }

    // Via the strict parser, not `convertPathToPoints`, which returns `[]` for anything it cannot
    // read and so reported every unparsable row as pixel-space too.
    if (looksLikePixels(row.path)) {
      stillPixels.push(row.id)
    }

    const result = reorderPath(row.path, { height: row.height, width: row.width })
    if (result.next == null) {
      skip(result.reason, detail)
      continue
    }

    plan.push({
      after: result.next,
      before: row.path,
      id: row.id,
      route: row.routeId,
      size: `${row.width}x${row.height}`,
      topo: row.topoId,
    })
  }

  // Crumbs FIRST, so an interrupted write still leaves a complete record of what it intended.
  const stamp = Date.now()
  writeFileSync(`topo-order-plan-${stamp}.json`, JSON.stringify(plan, null, 2))
  writeFileSync(
    `topo-order-revert-${stamp}.sql`,
    `begin;\n${plan
      .map((entry) => `update topo_routes set path = '${entry.before.replaceAll("'", "''")}' where id = ${entry.id};`)
      .join('\n')}\ncommit;\n`,
  )
  console.log(`wrote topo-order-plan-${stamp}.json and topo-order-revert-${stamp}.sql`)

  if (!dryRun) {
    for (const entry of plan) {
      await db.update(schema.topoRoutes).set({ path: entry.after }).where(eq(schema.topoRoutes.id, entry.id))
    }
  }

  for (const entry of plan.slice(0, 5)) {
    console.log(`\n#${entry.id}  route ${entry.route}  topo ${entry.topo}  ${entry.size}`)
    console.log(`  before ${entry.before}`)
    console.log(`  after  ${entry.after}`)
  }
  console.log(`\n${plan.length} path(s) ${dryRun ? 'would be' : ''} reordered`)
  // The small buckets print in full, route id included, so a row can be opened at /routes/<id> and
  // looked at. A count alone gives no way to tell a guard doing its job from a guard refusing rows
  // it should have taken, which is how the last two bugs in this script got through.
  for (const [reason, rows] of Object.entries(skipped)) {
    console.log(`  ${reason}: ${rows.length}`)
    if (rows.length > 40 && reason !== SHOW) {
      continue
    }
    for (const row of rows) {
      console.log(`    #${row.id}  route ${row.route}  topo ${row.topo}  ${row.size}`)
      console.log(`      ${row.path}`)
    }
  }

  // `saveTopoLines` writes no event when the photo has no block, so a v2 line on one of those
  // cannot be protected by the guard above. Counted rather than assumed away.
  const [{ total: unattached }] = await db
    .select({ total: count() })
    .from(schema.topoRoutes)
    .innerJoin(schema.topos, eq(schema.topoRoutes.topoFk, schema.topos.id))
    .where(isNull(schema.topos.blockFk))
  if (unattached > 0) {
    console.log(
      `\n${unattached} line(s) sit on a photo with no block. A v2 save on those writes no event, ` +
        'so nothing would mark them as drawn by hand.',
    )
  }

  if (stillPixels.length > 0) {
    console.log(
      `\n${stillPixels.length} row(s) are still in PIXEL space and render off-photo until ` +
        `migrate-topo-paths converts them: ${stillPixels.join(', ')}`,
    )
  }

  return plan
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Which database, before anything is read or written. A run pointed at the wrong one is the
  // failure this script cannot undo, and the connection string lives in an env file nobody reads.
  console.log(`target: ${describeTarget(drizzleConfig.dbCredentials.url)}${CONFIRM ? '  (WRITING)' : '  (dry run)'}\n`)

  const sql = Database(drizzleConfig.dbCredentials.url, { max: 1, prepare: false })
  await migrate(drizzle(sql, { schema }), { dryRun: !CONFIRM })
  if (!CONFIRM) {
    console.log('\nDRY RUN - nothing written. Set CONFIRM=true to commit.')
  }
  await sql.end()
}
