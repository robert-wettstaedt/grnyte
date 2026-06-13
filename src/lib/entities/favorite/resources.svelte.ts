import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toUserFavorite } from './mapper'

/**
 * The signed-in user's favorited routes. Gated by `enabled` so it only syncs
 * when needed (e.g. the favorites filter is active), and skipped entirely until
 * a `userId` is available.
 */
export function userFavoriteList(userId: () => number | undefined, enabled: () => boolean = () => true) {
  return createResource(
    () => queries.listUserFavorites({ userId: userId() ?? 0 }),
    (rows) => rows.map(toUserFavorite),
    { enabled: () => userId() != null && enabled() },
  )
}
