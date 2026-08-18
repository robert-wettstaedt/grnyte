export type FavoriteEntityType = 'area' | 'block' | 'route'

/**
 * Which column holds the object, per entity type.
 *
 * The client speaks `entityType` + `entityId` (that is what `SaveButton` and the profile list are
 * written in); the table carries three nullable foreign keys with a CHECK that exactly one is set.
 * This is the one place the two vocabularies meet.
 */
export const FAVORITE_KEY = {
  area: 'areaFk',
  block: 'blockFk',
  route: 'routeFk',
} as const satisfies Record<FavoriteEntityType, string>

/** The same three, as a list, so the zod enums are derived from the map rather than restating it. */
export const FAVORITE_TYPES = Object.keys(FAVORITE_KEY) as [FavoriteEntityType, ...FavoriteEntityType[]]

/** Minimal favorite shape used to derive a user's favorited routes. */
export interface UserFavorite {
  routeId: number
}

/** A favorited entity of any type, for the profile's Favorites list. */
export interface UserFavoriteEntity {
  /** The row's own key, as a number: the columns are real foreign keys now, so nothing between
   *  here and the database needs to stringify and re-parse it. */
  entityId: number
  entityType: FavoriteEntityType
}
