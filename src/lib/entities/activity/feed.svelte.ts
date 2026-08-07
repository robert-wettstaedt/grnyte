import { getGlobalState } from '$lib/state/global.svelte'
import type { QueryResource } from '$lib/zero/resource.svelte'
import { SvelteSet } from 'svelte/reactivity'
import { activityCard, type ActivityCardView } from './card'
import type { ActivityCategory, ActivityEntityType, ActivityListItem } from './dto'
import { groupActivities } from './grouping'
import { activityEntities } from './hydrate.svelte'
import { activityList } from './resources.svelte'

/**
 * A feed, from a filter to the cards it renders.
 *
 * Everything between those two ends used to live in the page: the sync window and what one
 * "load older" adds to it, the mark that decides which rows wait behind the "N new" pill, the
 * two windows either side of that mark, the grouping, the hydration, and the set of open cards
 * that decides which topo photos are worth fetching. Ten decisions in a route file, where
 * nothing could reach them and a second feed would have had to copy them.
 *
 * They are here now, so a scoped feed (`queries.ts` already takes a `scope`) is one call, and
 * the page is markup. What stays in `ActivityFeed.svelte` is what markup is for: the day
 * dividers, the pill, the lightbox.
 */

/** What a feed is narrowed to. The window is this module's business, not a caller's. */
export interface ActivityFeedFilter {
  /** Ascents, or every other kind of edit. */
  category?: ActivityCategory
  /** Narrow to one region when the user belongs to several. */
  regionFk?: number
  /** Scope to one entity: its own rows plus the rows its children logged against it. */
  scope?: { id: string; type: ActivityEntityType }
  /** Narrow to one actor. */
  userFk?: number
}

export interface ActivityFeedResult {
  /** Take the queued rows into the window on screen, and mark them read. */
  acknowledge: () => void
  /**
   * Ids of the cards whose changes are open, mutated in place by `ActivityFeed`.
   *
   * Here rather than per card because only an open card's rows are worth a topo query: the
   * change list behind the toggle is the one thing that draws a photo, so syncing every block's
   * topo tree would charge a reader who never expands anything, again on each "load older".
   */
  readonly expandedIds: SvelteSet<string>
  /** Whether the sync window can still grow. */
  readonly hasMore: boolean
  /** Grow the window by a page. */
  loadOlder: () => void
  /** Rows that arrived while the reader was reading. */
  readonly newCount: number
  /** The window on screen, for `QueryState` to read loading, error and empty off. */
  readonly resource: QueryResource<ActivityListItem[]>
  /** The cards, newest first, each already decided. */
  readonly views: ActivityCardView[]
}

/** Rows per window, and what one "load older" adds. It also caps the pill's count: past a page
 *  of unread rows the number stops being worth the rows it would sync. */
const PAGE_SIZE = 50

export function activityFeed(filter: () => ActivityFeedFilter = () => ({})): ActivityFeedResult {
  const global = getGlobalState()

  let limit = $state(PAGE_SIZE)
  /** Id of the newest activity the reader has acknowledged. Anything above it waits. */
  let seen = $state<number>()

  // Two windows either side of the mark rather than one filtered list: rows that arrive while
  // reading would push the list down under the cursor, and if they merely counted against
  // `limit` they would also push an equal number of old rows off the bottom.
  const activities = activityList(() => ({ ...filter(), limit, upToId: seen }))
  const incoming = activityList(() => ({ ...filter(), afterId: seen, limit: PAGE_SIZE }), {
    enabled: () => seen != null,
  })

  const groups = $derived(groupActivities(activities.data))

  const expandedIds = new SvelteSet<string>()
  const expandedActivities = $derived(
    groups.filter((group) => expandedIds.has(group.id)).flatMap((group) => group.activities),
  )

  const hydration = activityEntities(
    () => activities.data,
    () => expandedActivities,
  )

  // Decided once per group, so the component is markup and its lightbox reads the same files the
  // cards show rather than walking the hydration map again.
  const views = $derived(
    groups.map((group) => activityCard(group, hydration.entities, global.user?.id, hydration.topos)),
  )

  const acknowledge = () => {
    seen = incoming.data[0]?.id ?? activities.data[0]?.id
  }

  // The first window is what the reader opened the page to, so it counts as read; only what
  // lands after that queues behind the pill. A one-time capture, so it cannot be `$derived`: a
  // mark that kept following the newest row would never hold anything back.
  //
  // Both reset with the filter, since a narrowed feed is a different list: an old mark would hold
  // back rows the reader has never seen, and a window grown by five "load older" taps would come
  // back as five pages of whatever they just narrowed to.
  $effect(() => {
    filter()
    limit = PAGE_SIZE
    seen = undefined
  })

  $effect(() => {
    if (seen == null && activities.data.length > 0) {
      acknowledge()
    }
  })

  return {
    acknowledge,
    expandedIds,
    get hasMore() {
      // Zero hands back at most `limit` rows, so a full window is the only signal that there are
      // older ones. A window that comes back short is the end of the log.
      return activities.data.length >= limit
    },
    loadOlder: () => {
      limit += PAGE_SIZE
    },
    get newCount() {
      return incoming.data.length
    },
    get resource() {
      return activities
    },
    get views() {
      return views
    },
  }
}
