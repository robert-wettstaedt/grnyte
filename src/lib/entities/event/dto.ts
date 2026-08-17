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

export type EventObjectType = keyof typeof EVENT_OBJECT_COLUMNS

/**
 * Whether an event is a SEND rather than crag housekeeping: about an ascent, and not a media
 * removal.
 *
 * A removal logs on the parent, because the file row is gone by then, so it arrives as an ascent
 * event and is the one exception. Three places ask this and each used to spell it out: the feed's
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
