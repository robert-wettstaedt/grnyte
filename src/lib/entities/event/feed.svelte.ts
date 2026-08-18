import type { EventEntityRef } from '$lib/entities/event/entity'
import { markEventFeedSeen } from '$lib/entities/notification/notifications.remote'
import { parseTopoChange } from '$lib/entities/topo/change'
import { toposByBlockIds } from '$lib/entities/topo/resources.svelte'
import { getGlobalState } from '$lib/state/global.svelte'
import type { QueryResource } from '$lib/zero/resource.svelte'
import { SvelteSet } from 'svelte/reactivity'
import { eventCard, type EventCardView } from './card'
import type { EventObjectType } from './dto'
import { groupEvents } from './grouping'
import type { EventListItem } from './mapper'
import { eventList, type EventCursor } from './resources.svelte'

export interface EventFeedFilter {
  /** Narrow to one actor. */
  actorFk?: number
  /** Ascents, or every other kind of edit. */
  category?: 'ascent' | 'update'
  /** Narrow to one region when the user belongs to several. */
  regionFk?: number
  /** Scope to one entity's log: events about it, plus events whose changes name it. */
  scope?: { id: number | string; type: EventObjectType }
}

export interface EventFeedResult {
  /** Take the queued rows into the window on screen, and mark them read. */
  acknowledge: () => void
  /**
   * Ids of the cards whose changes are open, mutated in place by the feed component.
   *
   * Here rather than per card because only an open card's rows are worth a topo query: the change
   * list behind the toggle is the one thing that draws a photo, so syncing every block's topo tree
   * would charge a reader who never expands anything, again on each "load older".
   */
  readonly expandedIds: SvelteSet<string>
  /** Whether the sync window can still grow. */
  readonly hasMore: boolean
  /** Grow the window by a page. */
  loadOlder: () => void
  /** Rows that arrived while the reader was reading. */
  readonly newCount: number
  /** The window on screen, for `QueryState` to read loading, error and empty off. */
  readonly resource: QueryResource<EventListItem[]>
  /** The cards, newest first, each already decided. */
  readonly views: EventCardView[]
}

/** Rows per window, and what one "load older" adds. It also caps the pill's count: past a page of
 *  unread rows the number stops being worth the rows it would sync. */
const PAGE_SIZE = 50

export function eventFeed(filter: () => EventFeedFilter = () => ({})): EventFeedResult {
  const global = getGlobalState()

  let limit = $state(PAGE_SIZE)
  /**
   * The newest event the reader has acknowledged, as the pair the list is ordered by.
   *
   * A cursor rather than an id, because event ids do not run with their timestamps: the backfill
   * emitted them in island order, so an id cut would put most of the log on the wrong side of both
   * windows.
   */
  let seen = $state<EventCursor>()

  // Two windows either side of the mark rather than one filtered list: rows that arrive while
  // reading would push the list down under the cursor, and if they merely counted against `limit`
  // they would also push an equal number of old rows off the bottom.
  const events = eventList(() => ({ ...filter(), limit, upTo: seen }))
  const incoming = eventList(() => ({ ...filter(), after: seen, limit: PAGE_SIZE }), {
    enabled: () => seen != null,
  })

  const groups = $derived(groupEvents(events.data))

  const expandedIds = new SvelteSet<string>()
  // Only the open cards, and among those only the events that say a topo photo changed, which
  // `parseTopoChange` reads off the metadata. Taking every block event would sync that block's
  // whole topo tree (its topos and their files) for a card that merely renamed it, which is the
  // cost the "open cards only" rule exists to avoid in the first place.
  //
  // Deduped by `indexOf` rather than through a Set, which the lint rule would want to be a
  // `SvelteSet`: this is rebuilt whole on every derivation, so reactivity on it buys nothing.
  const expandedBlockIds = $derived(
    groups
      .filter((group) => expandedIds.has(group.id))
      .flatMap((group) => group.events)
      .flatMap((event) =>
        event.objectType === 'block' && parseTopoChange(event.metadata) != null ? [Number(event.objectId)] : [],
      )
      .filter(Number.isInteger)
      .filter((id, index, all) => all.indexOf(id) === index),
  )

  const topos = toposByBlockIds(() => expandedBlockIds)

  // Decided once per group, so the component is markup and its lightbox reads the same files the
  // cards show. The scope doubles as what the cards leave out: a feed narrowed to one entity
  // renders on that entity's page, where a row pointing at it links to the page already open.
  const views = $derived(groups.map((group) => eventCard(group, global.user?.id, topos.data, omitRef(filter().scope))))

  const acknowledge = () => {
    const newest = incoming.data[0] ?? events.data[0]
    seen = newest == null ? undefined : { createdAt: newest.createdAt, id: newest.id }

    // Persisted only on the UNFILTERED feed. A scoped one (an entity's log, one actor's activity)
    // is a different list, and letting it move the global watermark would mark a region's whole
    // backlog read because somebody opened one crag's history.
    if (seen != null && isGlobal(filter())) {
      void markEventFeedSeen({ seenAt: Math.round(seen.createdAt) }).catch(() => undefined)
    }
  }

  // Both reset with the filter, since a narrowed feed is a different list: an old mark would hold
  // back rows the reader has never seen, and a window grown by five "load older" taps would come
  // back as five pages of whatever they just narrowed to.
  $effect(() => {
    filter()
    limit = PAGE_SIZE
    seen = undefined
  })

  // The first window is what the reader opened the page to, so it counts as read; only what lands
  // after that queues behind the pill. A one-time capture, so it cannot be `$derived`: a mark that
  // kept following the newest row would never hold anything back.
  $effect(() => {
    if (seen == null && events.data.length > 0) {
      acknowledge()
    }
  })

  return {
    acknowledge,
    expandedIds,
    get hasMore() {
      // Zero hands back at most `limit` rows, so a full window is the only signal that there are
      // older ones. A window that comes back short is the end of the log.
      return events.data.length >= limit
    },
    loadOlder: () => {
      limit += PAGE_SIZE
    },
    get newCount() {
      return incoming.data.length
    },
    get resource() {
      return events
    },
    get views() {
      return views
    },
  }
}

/**
 * Whether this feed is the whole thing rather than a slice of it.
 *
 * Only the whole feed may move the persisted watermark, which is what the push digest counts
 * against. `category` is deliberately NOT part of it: the segmented control hides half the rows but
 * the reader is still looking at the global feed, and a digest that re-announced everything they
 * filtered out would be worse than one that skipped a card they chose not to see.
 */
function isGlobal(filter: EventFeedFilter): boolean {
  return filter.actorFk == null && filter.regionFk == null && filter.scope == null
}

/** The scope as the card reads it, whose ids are text. */
function omitRef(scope: EventFeedFilter['scope']): EventEntityRef | undefined {
  return scope == null ? undefined : { id: String(scope.id), type: scope.type }
}
