import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { UserFavorite } from './dto'

export type UserFavoriteRow = QueryRow<typeof queries.listUserFavorites>

export function toUserFavorite(row: UserFavoriteRow): UserFavorite {
  return {
    routeId: Number(row.entityId),
  }
}
