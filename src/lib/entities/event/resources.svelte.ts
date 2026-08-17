import { getGlobalState } from '$lib/state/global.svelte'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { EventObjectType } from './dto'
import { toEvent } from './mapper'

/** A place in the list, as the pair the list is ordered by. See `queries.ts`. */
export interface EventCursor {
  createdAt: number
  id: number
}

export interface EventListFilter {
  /** Narrow to one actor. */
  actorFk?: number
  /** Only rows newer than this one: what has landed since the reader last looked. */
  after?: EventCursor
  /** Ascents, or every other kind of edit. */
  category?: 'ascent' | 'update'
  /** Sync window. Defaults to the query's 50; bump it to load older rows. */
  limit?: number
  /** Narrow to one region when the user belongs to several. */
  regionFk?: number
  /**
   * Scope to one entity's log: events ABOUT that record, plus events whose changes name it. That
   * second half is what lets a block find the reorder that moved it, whose object is its area.
   */
  scope?: { id: number | string; type: EventObjectType }
  /** Only rows at or older than this one: the window the reader has acknowledged. */
  upTo?: EventCursor
}

/**
 * A window of events, each already carrying the entity it is about.
 *
 * `userRegions` comes off the global state because the region crumb is only drawn for a reader who
 * spans more than one, so it belongs to the reader rather than the row. That makes this a resource
 * factory like the others: call it during component initialisation.
 */
export function eventList(filter: () => EventListFilter = () => ({}), opts?: { enabled?: () => boolean }) {
  const global = getGlobalState()

  return createResource(
    () => queries.listEvents(filter()),
    (rows) => rows.map((row) => toEvent(row, global.userRegions)),
    opts,
  )
}
