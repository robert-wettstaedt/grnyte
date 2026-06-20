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
    // ponytail: -1 can't be a real user id; only reached while disabled (userId null)
    () => queries.listUserFavorites({ userId: userId() ?? -1 }),
    (rows) => rows.map(toUserFavorite),
    { enabled: () => userId() != null && enabled() },
  )
}

/** Whether the signed-in user has favorited one specific entity. Reactive, so it
 *  flips on its own once a {@link toggleFavorite} write syncs back through Zero. */
export function isFavorited(
  userId: () => number | undefined,
  entityType: () => 'block' | 'route' | 'area',
  entityId: () => string,
) {
  return createResource(
    // ponytail: -1 can't be a real user id; only reached while disabled (userId null)
    () => queries.listUserEntityFavorites({ userId: userId() ?? -1, entityType: entityType(), entityId: entityId() }),
    (rows) => rows.length > 0,
    { enabled: () => userId() != null },
  )
}
