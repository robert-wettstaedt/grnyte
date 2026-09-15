import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { UserFavorite, UserFavoriteEntity } from './dto'

export type UserAllFavoriteRow = QueryRow<typeof queries.listUserAllFavorites>
export type UserFavoriteRow = QueryRow<typeof queries.listUserFavorites>

/**
 * Rows come from a query filtered on `routeFk IS NOT NULL`, and `favorites_one_object` guarantees
 * one key per row, so both mappers return null rather than inventing an id when neither holds. A
 * fabricated 0 is worse than a missing row: it renders a tile that navigates to `/routes/0`, and
 * it joins the map filter's favorited set where nothing can ever match it. Callers drop the nulls.
 */
export function toUserFavorite(row: UserFavoriteRow): null | UserFavorite {
  return row.routeFk == null ? null : { routeId: row.routeFk }
}

export function toUserFavoriteEntity(row: UserAllFavoriteRow): null | UserFavoriteEntity {
  const object =
    row.routeFk != null
      ? ({ entityId: row.routeFk, entityType: 'route' } as const)
      : row.blockFk != null
        ? ({ entityId: row.blockFk, entityType: 'block' } as const)
        : row.areaFk != null
          ? ({ entityId: row.areaFk, entityType: 'area' } as const)
          : null

  return object
}
