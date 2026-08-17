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

export type EventObjectType = keyof typeof EVENT_OBJECT_COLUMNS

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
