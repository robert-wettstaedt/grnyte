import type { Event } from '$lib/zero/zero-schema.gen'

/**
 * The six things an event can be about, and the column each one lands in.
 *
 * Here rather than in `event.server.ts` because the read path needs it too, and SvelteKit refuses
 * to bundle a `.server.` module into the browser: importing it from `queries.ts` (which reaches
 * the client through the Zero query registry) took the whole app down with a guard error.
 *
 * Keyed off the generated Zero row rather than the drizzle one, so it is client-safe and still
 * breaks at compile time when a column is renamed.
 */
export const EVENT_OBJECT_COLUMNS = {
  area: 'areaFk',
  ascent: 'ascentFk',
  block: 'blockFk',
  file: 'fileFk',
  route: 'routeFk',
  user: 'subjectFk',
} as const satisfies Record<string, keyof Event>

/** What the feed's segmented control filters on: ascents versus every other kind of edit. */
export type EventCategory = 'ascent' | 'update'

/**
 * The objects whose `update` events are field edits, and so may be drawn at compact tier.
 *
 * Here rather than in `card.ts` because it is a statement about the domain (which of the six
 * objects is a PLACE) rather than about a card. Files are in it and blocks' parents are not the
 * point: what unites them is that nobody is accountable for a field on one of them the way they
 * are for a deletion or a role.
 *
 * Two neighbours it is NOT, and both have been merged with it by mistake:
 *
 * - `CRAG_OBJECT_TYPES` in `grouping.ts` asks which objects share a burst card, where a file
 *   groups by the thing it landed on rather than by itself, so `file` is absent there.
 * - the `notifyCragEdits` setting, which users read as "Crag edits", is broader in both
 *   directions: every verb, and everything that is not an ascent or a person. Its own hint says
 *   "New areas, blocks, routes, topos and photos", which is the `create` traffic this set exists
 *   to keep OUT of the compact tier.
 *
 * Three questions, three sets. Keep them apart.
 */
export const FIELD_EDIT_OBJECT_TYPES: ReadonlySet<EventObjectType> = new Set([
  'area',
  'block',
  'file',
  'route',
] as const satisfies EventObjectType[])

export type EventObjectType = keyof typeof EVENT_OBJECT_COLUMNS

/**
 * Whether an event is a SEND rather than a crag edit: about an ascent, and not a media removal.
 *
 * A removal logs on the parent, because the file row is gone by then, so it arrives as an ascent
 * event and is the one exception. Three places ask this: the feed's
 * segmented control (as a Zero where-clause, which cannot call a predicate and mirrors this
 * instead), the client's grouping, and the digest's category switch. The last two disagreeing
 * means a push announcing a send that the feed files under edits.
 */
export function isAscentEvent(event: { ascent: boolean; verb: Event['verb'] }): boolean {
  return event.ascent && event.verb !== 'remove'
}

/** Which of the six object columns this row set. The CHECK guarantees exactly one. */
export function objectOf(row: {
  [K in (typeof EVENT_OBJECT_COLUMNS)[EventObjectType]]?: null | number | string
}): undefined | { id: number | string; type: EventObjectType } {
  for (const [type, column] of Object.entries(EVENT_OBJECT_COLUMNS) as [
    EventObjectType,
    (typeof EVENT_OBJECT_COLUMNS)[EventObjectType],
  ][]) {
    const id = row[column]
    if (id != null) {
      return { id, type }
    }
  }

  return undefined
}
