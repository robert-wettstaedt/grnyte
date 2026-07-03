import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import type { AscentType } from './dto'
import { toUserAscent } from './mapper'
import { ascentStatusByRoute } from './status'

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
 * The signed-in user's tick per route (repeat > flash > send > attempt) — the
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
