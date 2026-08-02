import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { AscentType } from './dto'
import { toAscentDetail, toRouteAscent, toUserAscent, toUserAscentDetail } from './mapper'
import { ascentStatusByRoute } from './status'

/** One ascent with its media, for the edit-ascent form. */
export function ascentDetail(id: () => number) {
  return createResource(
    () => queries.ascent({ ascentId: id() }),
    (rows) => (rows[0] == null ? undefined : toAscentDetail(rows[0])),
  )
}

/**
 * Ascents for a set of ids, enriched with route name, community grade and media. The
 * activity feed hydrates the ascent ids its rows point at; callers reorder the result by
 * their own list. An empty id set is a normal terminal state here (a feed window with no
 * ascents in it), so it queries `IN []` and settles as ready-and-empty rather than gating
 * the resource off and reporting `loading` forever.
 */
export function ascentsByIds(ids: () => number[], opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listAscentsByIds({ ascentId: ids() }),
    (rows) => rows.map(toUserAscentDetail),
    opts,
  )
}

/**
 * All ascents of one route, with their media — the route detail page's
 * grade-opinion chart and ascent beta videos.
 */
export function routeAscentList(routeId: () => number) {
  return createResource(
    () => queries.listRouteAscents({ routeId: routeId() }),
    (rows) => rows.map(toRouteAscent),
  )
}

/**
 * A user's ascents enriched with route name + community grade and their media —
 * the profile page's sessions, stats and grade histogram. Separate from the lean
 * `userAscentList` so the shared ascent-status query stays small. Gated by
 * `enabled` and skipped until a `userId` is available.
 */
export function userAscentDetailList(userId: () => number | undefined, enabled: () => boolean = () => true) {
  return createResource(
    () => queries.listUserAscentsDetailed({ userId: userId() ?? -1 }),
    (rows) => rows.map(toUserAscentDetail),
    { enabled: () => userId() != null && enabled() },
  )
}

/**
 * The signed-in user's ascents. Gated by `enabled` so it only syncs when
 * needed (e.g. an ascent-status filter is active), and skipped entirely until
 * a `userId` is available.
 */
export function userAscentList(userId: () => number | undefined, enabled: () => boolean = () => true) {
  return createResource(
    () => queries.listUserAscents({ userId: userId() ?? -1 }),
    (rows) => rows.map(toUserAscent),
    { enabled: () => userId() != null && enabled() },
  )
}

/**
 * The signed-in user's status per route (repeat > flash > redpoint > attempt): the
 * status every `RouteRow` shows. Pages sharing it reuse the same underlying
 * `listUserAscents` query, which Zero dedupes.
 */
export function userAscentStatus(userId: () => number | undefined) {
  const ascents = userAscentList(userId)
  const byRoute = $derived(ascentStatusByRoute(ascents.data))
  return {
    get(routeId: number): AscentType | undefined {
      return byRoute.get(routeId)
    },
  }
}
