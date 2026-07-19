import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { UserFavorite, UserFavoriteEntity } from './dto'

export type UserAllFavoriteRow = QueryRow<typeof queries.listUserAllFavorites>
export type UserFavoriteRow = QueryRow<typeof queries.listUserFavorites>

export function toUserFavorite(row: UserFavoriteRow): UserFavorite {
  return {
    routeId: Number(row.entityId),
  }
}

export function toUserFavoriteEntity(row: UserAllFavoriteRow): UserFavoriteEntity {
  return {
    entityId: row.entityId,
    entityType: row.entityType,
    regionFk: row.regionFk,
  }
}
