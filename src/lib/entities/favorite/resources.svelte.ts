import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toUserFavorite } from './mapper'

/** Whether the signed-in user has favorited one specific entity. Reactive, so it
 *  flips on its own once a {@link toggleFavorite} write syncs back through Zero. */
export function isFavorited(
  userId: () => number | undefined,
  entityType: () => 'area' | 'block' | 'route',
  entityId: () => string,
) {
  return createResource(
    // ponytail: -1 can't be a real user id; only reached while disabled (userId null)
    () => queries.listUserEntityFavorites({ entityId: entityId(), entityType: entityType(), userId: userId() ?? -1 }),
    (rows) => rows.length > 0,
    { enabled: () => userId() != null },
  )
}

/** How many *other* users have saved one entity (excludes the signed-in user). */
export function otherSaveCount(
  userId: () => number | undefined,
  entityType: () => 'area' | 'block' | 'route',
  entityId: () => string,
) {
  return createResource(
    () => queries.listEntityFavorites({ entityId: entityId(), entityType: entityType() }),
    (rows) => rows.filter((row) => row.userFk !== userId()).length,
  )
}

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
