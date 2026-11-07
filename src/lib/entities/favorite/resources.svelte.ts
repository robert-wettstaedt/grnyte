import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { and, eq, isNull, not } from '@tanstack/db'
import { FAVORITE_KEY, type FavoriteEntityType } from './dto'
import { toUserFavorite, toUserFavoriteEntity, type UserAllFavoriteRow } from './mapper'

const COLUMN = { area: 'area_fk', block: 'block_fk', route: 'route_fk' } as const satisfies Record<
  FavoriteEntityType,
  string
>

/** One user's favorites, newest first; -1 is never a user id, so an absent user reads as an empty list. */
const ofUser = <T>(userId: () => number | undefined, select: (rows: UserAllFavoriteRow[]) => T) =>
  psResource(
    (q) =>
      q
        .from({ f: collections().favorites })
        .where(({ f }) => eq(f.user_fk, userId() ?? -1))
        .orderBy(({ f }) => f.created_at, 'desc'),
    [userId],
    (rows) => select(rows.map((row) => toZeroRow<UserAllFavoriteRow>('favorites', row))),
    'region_activity',
  )

/** Whether the signed-in user has favorited one specific entity, answered from their whole list. */
export function isFavorited(
  userId: () => number | undefined,
  entityType: () => FavoriteEntityType,
  entityId: () => number,
) {
  return ofUser(userId, (rows) => rows.some((row) => row[FAVORITE_KEY[entityType()]] === entityId()))
}

/** How many users have saved one entity, the signed-in user included. Every member's saves sync with the region. */
export function saveCount(entityType: () => FavoriteEntityType, entityId: () => number) {
  return psResource(
    (q) => q.from({ f: collections().favorites }).where(({ f }) => eq(f[COLUMN[entityType()]], entityId())),
    [entityType, entityId],
    (rows) => rows.length,
    'region_activity',
  )
}

/** A user's favorites across all entity types (area/block/route), newest first: the profile's Favorites section. */
export function userAllFavoriteList(userId: () => number | undefined) {
  return ofUser(userId, (rows) => rows.map(toUserFavoriteEntity).filter((favorite) => favorite != null))
}

/** The signed-in user's favorited routes, for the map's favorites filter; empty while `enabled` is false. */
export function userFavoriteList(userId: () => number | undefined, enabled: () => boolean = () => true) {
  return psResource(
    (q) =>
      q
        .from({ f: collections().favorites })
        .where(({ f }) => and(eq(f.user_fk, enabled() ? (userId() ?? -1) : -1), not(isNull(f.route_fk)))),
    [userId, enabled],
    (rows) => rows.map((row) => toUserFavorite(toZeroRow('favorites', row))).filter((favorite) => favorite != null),
    'region_activity',
  )
}
