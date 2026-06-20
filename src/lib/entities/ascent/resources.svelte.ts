import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toUserAscent } from './mapper'

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
