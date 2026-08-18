import type { TopoView } from '$lib/entities/topo/dto'
import { cardView, type CardGroup, type CardView } from './cardView'
// The cast comes from the case wall, so a name in a unit test and the same id on the wall are
// the same person. Two lists drifting would make one file's "Sofia Brandt" another's stranger.
import { ME, PEOPLE } from './cases/world'
import { changeViews, type ChangeView } from './change'
import { eventEntityKey, type EventEntity, type EventEntityMap, type EventEntityRef } from './entity'
/**
 * The line fixtures the card layer's own unit tests build on.
 *
 * These test `cardView`, `changeViews` and `metaLine` directly, so they state a LINE rather than an
 * event: what those functions decide from is one line per thing a card says, and going through an
 * event would only add the expansion `line.ts` already has its own coverage for. The wall in
 * `cases/` is the other half, and starts from events.
 *
 * Not imported by the app.
 */
import type { CardLine } from './line'

export { ME, PEOPLE }

let nextId = 1

/** The change lines an expanded card would show, one line at a time so a caller can hand in a set
 *  that a card would otherwise split. Runs the real renderer, so it cannot drift from it. */
export function changes(rows: CardLine[], topos?: ReadonlyMap<number, TopoView>): ChangeView[] {
  return rows.flatMap((row) => changeViews([row], { topos }))
}

/** The map a card reads entities out of: an absent key is gone, the same as an explicit `null`. */
export function entityMap(entries: [EventEntityRef, EventEntity | null][]): EventEntityMap {
  return new Map(entries.map(([ref, entity]) => [eventEntityKey(ref), entity]))
}

/** The card those lines make, as `eventCard` would hand it over. */
export function group(rows: CardLine[], kind: CardGroup['kind'] = rows.length === 1 ? 'single' : 'entity'): CardGroup {
  return {
    actorFk: rows[0]?.actorFk ?? ME,
    createdAt: rows[0]?.createdAt ?? 0,
    id: 'fixture',
    kind,
    rows,
  }
}

/** One line, with every field defaulted so a caller states only what it is about. */
export function line(partial: Partial<CardLine> = {}): CardLine {
  return {
    actorFk: ME,
    actorName: PEOPLE[ME],
    cleared: false,
    columnName: undefined,
    createdAt: 0,
    id: nextId++,
    metadata: undefined,
    newValue: undefined,
    // A NUMBER, as the mapper hands one over for five of the six object types. A string default
    // made every fixture satisfy a comparison production could never satisfy.
    objectId: 1,
    objectType: 'route',
    oldValue: undefined,
    parentId: undefined,
    parentType: undefined,
    regionFk: 1,
    value: undefined,
    verb: 'update',
    ...partial,
  }
}

/** What a card says about a set of lines, decided by the same function the feed calls. */
export function view(
  rows: CardLine[],
  entities?: EventEntityMap,
  currentUserFk?: number,
  topos?: ReadonlyMap<number, TopoView>,
  kind?: CardGroup['kind'],
): CardView {
  return cardView(group(rows, kind), entities, currentUserFk, topos)
}
