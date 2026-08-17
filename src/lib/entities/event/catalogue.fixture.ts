import type { MediaFile } from '$lib/entities/file/dto'
import { stringifyTopoChange, stringifyTopoLines, type TopoAction } from '$lib/entities/topo/change'
import type { TopoView } from '$lib/entities/topo/dto'
import { groupCatalogueRows, type CardGroup } from './cardGroup'
import { cardView, type CardView } from './cardView'
import type { CatalogueRow } from './catalogue'
import type { ChangeView } from './change'
import { eventEntityKey, type EventEntity, type EventEntityMap, type EventEntityRef } from './entity'

/**
 * The activity fixtures every test and story builds on.
 *
 * One builder rather than one per file: the row shape was copied into three test files and a
 * story module, so a column added to `CatalogueRow` had to be remembered four times, and a
 * default that drifted made two files disagree about what a plain row is.
 *
 * Two builders, because the two readers want different things from a row. `activity` states a
 * shape and nothing else, which is what an assertion needs. `activityAgo` dates a row against
 * the clock and hands it a serial id, which is what a wall of cards needs to read like a week.
 *
 * Not imported by the app.
 */

/** The signed-in climber, so a card reads "You ...". */
export const ME = 1

/** The people a fixture's rows are logged by, so a card has a name to put in its headline. */
export const PEOPLE: Record<number, string> = {
  2: 'Tomas Kessler',
  3: 'Sofia Brandt',
  4: 'Jonas Weber',
  5: 'Mara Lindqvist',
  [ME]: 'Ada Rossi',
}

/**
 * Wall-clock base, read once so every row in one run dates off the same moment.
 *
 * Deliberately the real clock rather than a fixed stamp: the catalogue wall is read by eye, and
 * a card that says "5 minutes ago" is the point of it. Anything asserting on these fixtures has
 * to normalise the times away instead (see `cases.test.ts`).
 */
const base = Date.now()

let nextId = 1

/** One activity row, with every column defaulted so a caller states only what it is about. */
export function activity(partial: Partial<CatalogueRow>): CatalogueRow {
  return {
    columnName: undefined,
    createdAt: 0,
    entityId: '1',
    entityType: 'route',
    id: 1,
    metadata: undefined,
    newValue: undefined,
    oldValue: undefined,
    parentEntityId: undefined,
    parentEntityType: undefined,
    regionFk: 1,
    type: 'updated',
    userFk: 1,
    userName: 'ada',
    ...partial,
  }
}

/**
 * A row dated `minutesAgo` before the run, with a serial id and its actor's name filled in.
 *
 * The id matters as much as the clock: ids are serial in the database, grouping breaks ties on
 * them and a card keys on its oldest, so rows that all shared one id would fold differently
 * from the way the app folds them.
 */
export function activityAgo(
  minutesAgo: number,
  partial: Partial<CatalogueRow> & Pick<CatalogueRow, 'userFk'>,
): CatalogueRow {
  return activity({
    createdAt: base - minutesAgo * 60_000,
    id: nextId++,
    userName: PEOPLE[partial.userFk] ?? '',
    ...partial,
  })
}

/** The change lines an expanded card would show, one row at a time so a caller can hand in a
 *  set that grouping would otherwise split. Runs the real card, so it cannot drift from it. */
export function changes(rows: CatalogueRow[], topos?: ReadonlyMap<number, TopoView>): ChangeView[] {
  return rows.flatMap((entry) => view(groupCatalogueRows([entry])[0], undefined, undefined, topos).changes)
}

/** The map the feed hands cards: an absent key is still syncing, an explicit `null` is gone. */
export function entityMap(entries: [EventEntityRef, EventEntity | null][]): EventEntityMap {
  return new Map(entries.map(([ref, entity]) => [eventEntityKey(ref), entity]))
}

/** Groups rows exactly as the feed does. */
export function groups(rows: CatalogueRow[]): CardGroup[] {
  return groupCatalogueRows(rows)
}

export function photo(id: string): MediaFile {
  return {
    ascentCreatedBy: undefined,
    bunnyStreamFk: undefined,
    createdAt: base - 3_600_000,
    height: 900,
    id,
    path: 'topo-sample.svg',
    regionFk: 1,
    source: undefined,
    uploader: undefined,
    visibility: 'public',
    width: 1200,
  }
}

/**
 * The lines on a topo, as the writers encode them onto the row's old/new pair.
 *
 * One path per line rather than one for all of them. Sharing a path drew every ghost exactly
 * underneath a live line, so an erased line looked like it rendered nothing at all.
 */
export function topoLines(lines: readonly { name: string; routeFk: number }[], moved = false): string {
  return stringifyTopoLines(
    lines.map((line, index) => {
      const x = 0.2 + index * 0.22 + (moved ? 0.1 : 0)
      return { ...line, path: `M${x.toFixed(2)},0.9 L${(x + 0.08).toFixed(2)},0.2`, topType: 'top' }
    }),
  )
}

/** What a topo row says about itself: which of the five edits it was, and on which photo. */
export function topoMetadata(action: TopoAction, topoId?: number): string {
  return stringifyTopoChange({ action, topoId })
}

/** The photo a topo change row renders, with two lines drawn on it. */
export function topos(id = 700): ReadonlyMap<number, TopoView> {
  const line = (lineId: number, name: string, gradeFk: number, x: number) => ({
    gradeFk,
    id: lineId,
    name,
    points: [
      { id: `${lineId}-start`, type: 'start' as const, x, y: 0.88 },
      { id: `${lineId}-mid`, type: 'middle' as const, x: x + 0.04, y: 0.5 },
      { id: `${lineId}-top`, type: 'top' as const, x: x + 0.02, y: 0.12 },
    ],
    routeId: lineId,
    topType: 'top' as const,
  })

  return new Map([
    [
      id,
      {
        id,
        imageHeight: 900,
        imagePath: 'topo-sample.svg',
        imageWidth: 1200,
        lines: [line(501, 'Kante direkt', 11, 0.3), line(502, 'Rampe', 15, 0.6)],
      },
    ],
  ])
}

/**
 * A beta clip. Storybook has no Bunny to fetch a still from, so the tile renders the same play
 * placeholder a video still encoding does, which is what the card shows there too.
 */
export function video(id: string, source?: string): MediaFile {
  return { ...photo(id), bunnyStreamFk: `bunny-${id}`, path: '', source }
}

/** What a card says about a group, decided by the same function the feed calls. */
export function view(
  group: CardGroup,
  entities?: EventEntityMap,
  currentUserFk?: number,
  topoViews?: ReadonlyMap<number, TopoView>,
): CardView {
  return cardView(group, entities, currentUserFk, topoViews)
}
