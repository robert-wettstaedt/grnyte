/** Minimal favorite shape used to derive a user's favorited routes. */
export interface UserFavorite {
  routeId: number
}

/** A favorited entity of any type, for the profile's Favorites list. */
export interface UserFavoriteEntity {
  entityId: string
  entityType: 'area' | 'block' | 'route'
  /** The region the favorite belongs to, needed to remove it via toggleFavorite. */
  regionFk: number
}
