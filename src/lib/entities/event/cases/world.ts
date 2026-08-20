/**
 * The one crag every case points at, and the builders that write events about it.
 *
 * A case is the EVENTS a mutation writes, not rows invented for a screenshot: `eventAgo` produces
 * exactly what `toEvent` hands the feed, with the object already resolved, because that is what an
 * event carries. Nothing here needs an entity map: `eventCard` builds one from the events
 * themselves, the same way the app does.
 *
 * One world, so a reader comparing card to card is not relearning names each time:
 *
 * | id      | what                                              |
 * | ------- | ------------------------------------------------- |
 * | 300     | area "Steinbruch" (top level)                     |
 * | 301     | area "Westwand" (child of 300)                    |
 * | 400     | block "Nordblock" (in 301)                        |
 * | 500-503 | routes "Kante direkt", "Riss", "Dach", "Platte"    |
 * | 9001    | ascent of "Rampe", the reader's own                |
 * | 9002    | ascent of "Kante", Sofia's                         |
 * | 599     | a route that was deleted, so its card names a tombstone |
 * | 5       | user "Mara Lindqvist"                             |
 *
 * Storybook and tests only. Nothing in the app imports this.
 */
import type { MediaFile } from '$lib/entities/file/dto'
import { routeDisplayName } from '$lib/entities/route/mapper'
import { stringifyTopoChange, stringifyTopoLines, type TopoAction } from '$lib/entities/topo/change'
import type { TopoView } from '$lib/entities/topo/dto'
import type { EventObjectType } from '../dto'
import type { EventEntity } from '../entity'
import type { EventChangeItem, EventListItem } from '../mapper'

/** The signed-in climber, so a card reads "You ...". */
export const ME = 1

/** The people a case's events are written by, so a card has a name for its headline. */
export const PEOPLE: Record<number, string> = {
  2: 'Tomas Kessler',
  3: 'Sofia Brandt',
  4: 'Jonas Weber',
  5: 'Mara Lindqvist',
  [ME]: 'Ada Rossi',
}

/** The coordinates every pinned fixture uses, so two cases never read as two places. */
export const PIN = { lat: 47.123456, long: 8.56789 }

/**
 * Wall-clock base, read once so every event in one run dates off the same moment.
 *
 * Deliberately the real clock rather than a fixed stamp: the wall is read by eye and a card that
 * says "5 minutes ago" is half of what it is showing. Anything asserting on these has to
 * normalise the clock away instead (see `coverage.test.ts`).
 */
const base = Date.now()

let nextId = 1

/** A hydrated area, as the mapper builds one off `events.area`. */
export function areaEntity(name: string, parentName?: string): EventEntity {
  return { crumbs: parentName == null ? [] : [parentName], description: undefined, href: '#', name, row: 'area' }
}

/** A hydrated ascent: its route's row, plus what the climber said about it. */
export function ascentEntity(
  name: string,
  gradeFk: number,
  climberFk: number,
  ascentType: 'attempt' | 'flash' | 'redpoint' | 'repeat',
  extras: Partial<EventEntity> = {},
): EventEntity {
  return {
    ...routeEntity(name, gradeFk),
    ascentType,
    climberFk,
    climberName: PEOPLE[climberFk],
    ...extras,
  }
}

/**
 * Nordblock, hydrated the way a card gets it.
 *
 * The pin is only drawn by a create card, and one pin for every case so no two read as two
 * different places; `estimated` is the only thing a caller varies.
 */
export function blockEntity(name = 'Nordblock', estimated?: boolean): EventEntity {
  return {
    crumbs: ['Steinbruch', 'Westwand'],
    href: '#',
    name,
    pin: estimated == null ? undefined : { estimated, id: 1, ...PIN },
    row: 'block',
  }
}

/** One change row under an `update`, defaulted so a case states only the column that moved. */
export function change(partial: Partial<EventChangeItem> & Pick<EventChangeItem, 'columnName'>): EventChangeItem {
  return { newValue: undefined, objectId: undefined, objectType: undefined, oldValue: undefined, ...partial }
}

/**
 * One event, dated `minutesAgo` before the run, with a serial id and its actor's name filled in.
 *
 * The id matters as much as the clock: ids are serial in the database, `groupEvents` breaks ties
 * on them and a card keys on its smallest, so events sharing one id would fold differently from
 * the way the app folds them.
 *
 * The object's entity is resolved from {@link WORLD} unless the case states one, which is what
 * the real mapper does off the row's relation. Passing `entity: undefined` explicitly is how a
 * case says "this object resolves to nothing", which is a state the app can produce (a file).
 */
export function eventAgo(
  minutesAgo: number,
  partial: Omit<Partial<EventListItem>, 'actorFk'> & Pick<EventListItem, 'actorFk'>,
): EventListItem {
  const objectType = partial.objectType ?? 'route'
  const objectId = partial.objectId ?? 500
  const parent = 'parent' in partial ? partial.parent : parentOf(objectType, objectId)

  return {
    actorName: PEOPLE[partial.actorFk] ?? '',
    changes: [],
    commentCount: 0,
    createdAt: base - minutesAgo * 60_000,
    entity: 'entity' in partial ? partial.entity : entityOf(objectType, objectId),
    id: nextId++,
    metadata: undefined,
    objectId,
    objectType,
    parent,
    parentEntity: parent == null ? undefined : entityOf(parent.type, parent.id),
    promoted: false,
    reactions: [],
    regionFk: 1,
    verb: 'update',
    ...partial,
  }
}

/**
 * A file contributes media and a borrowed name, never a row of its own: the mapper hands back its
 * PARENT's entity with the file's media hung on it, which is where "added a photo to Rampe" gets
 * the name and the row underneath.
 */
export function fileEntity(parent: EventEntity, files: MediaFile[]): EventEntity {
  return { ...parent, files }
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
 * A hydrated route, named the way the feed really gets one.
 *
 * Through `routeDisplayName`, because the mapper has already swapped a blank name for the
 * `common_unnamed` placeholder by the time a card sees it: a fixture passing `''` would be
 * describing a state the app cannot produce.
 */
export function routeEntity(rawName: string, gradeFk: number): EventEntity {
  const name = routeDisplayName(rawName)
  return {
    crumbs: ['Steinbruch', 'Westwand', 'Nordblock'],
    href: '#',
    name,
    route: { description: '', gradeFk, name, rating: 2, tags: [] },
    row: 'route',
  }
}

/**
 * The lines on a topo, as the writers encode them onto a change row's old/new pair.
 *
 * One path per line rather than one for all of them: sharing a path drew every ghost exactly under
 * a live line, so an erased line looked like it rendered nothing at all.
 */
export function topoLines(lines: readonly { name: string; routeFk: number }[], moved = false): string {
  return stringifyTopoLines(
    lines.map((line, index) => {
      const x = 0.2 + index * 0.22 + (moved ? 0.1 : 0)
      return { ...line, path: `M${x.toFixed(2)},0.9 L${(x + 0.08).toFixed(2)},0.2`, topType: 'top' }
    }),
  )
}

/** What a topo event says about itself: which of the five edits it was, and on which photo. */
export function topoMetadata(action: TopoAction, topoId?: number): string {
  return stringifyTopoChange({ action, topoId })
}

/** The photo a topo change line renders, with two lines drawn on it. */
export function topoViews(id = 700): ReadonlyMap<number, TopoView> {
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

/** A person, as a membership event resolves one. */
export function userEntity(userFk: number): EventEntity {
  return { crumbs: [], href: '#', name: PEOPLE[userFk] ?? '', row: 'user' }
}

/** A calendar date `daysAgo` back, as Zero hands one back from a pg `date`: UTC midnight. */
export function utcDay(daysAgo: number): number {
  const date = new Date(base - daysAgo * 86_400_000)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * A beta clip. Storybook has no Bunny to fetch a still from, so the tile renders the same play
 * placeholder a video still encoding does, which is what the card shows there too.
 */
export function video(id: string, source?: string): MediaFile {
  return { ...photo(id), bunnyStreamFk: `bunny-${id}`, path: '', source }
}

/** Everything the world holds, by the key `eventAgo` resolves an object with. */
const WORLD = new Map<string, EventEntity>([
  ['area:300', areaEntity('Steinbruch')],
  ['area:301', areaEntity('Westwand', 'Steinbruch')],
  ['ascent:9001', ascentEntity('Rampe', 12, ME, 'flash')],
  ['ascent:9002', ascentEntity('Kante', 9, 3, 'redpoint')],
  ['block:400', blockEntity()],
  ['route:500', routeEntity('Kante direkt', 11)],
  ['route:501', routeEntity('Riss', 15)],
  ['route:502', routeEntity('Dach', 14)],
  ['route:503', routeEntity('Platte', 8)],
  // The two routes the world's ascents are ON. An ascent's entity borrows its route's name (that
  // is what the row renders), so an ascent of Rampe hanging under a route called something else
  // is a world that cannot happen: the card would name one in its sub line and the other on the
  // row underneath it.
  ['route:506', routeEntity('Rampe', 12)],
  ['route:507', routeEntity('Kante', 9)],
  ['user:1', userEntity(ME)],
  ['user:3', userEntity(3)],
  ['user:5', userEntity(5)],
])

/** What the world says a parent is, so a case does not restate the crag's shape per event. */
const PARENTS = new Map<string, { id: number | string; type: EventObjectType }>([
  ['area:301', { id: 300, type: 'area' }],
  ['ascent:9001', { id: 506, type: 'route' }],
  ['ascent:9002', { id: 507, type: 'route' }],
  ['block:400', { id: 301, type: 'area' }],
  ['route:500', { id: 400, type: 'block' }],
  ['route:501', { id: 400, type: 'block' }],
  ['route:502', { id: 400, type: 'block' }],
  ['route:503', { id: 400, type: 'block' }],
  ['route:506', { id: 400, type: 'block' }],
  ['route:507', { id: 400, type: 'block' }],
])

function entityOf(type: EventObjectType, id: number | string): EventEntity | undefined {
  return WORLD.get(`${type}:${id}`)
}

function parentOf(type: EventObjectType, id: number | string) {
  return PARENTS.get(`${type}:${id}`)
}
