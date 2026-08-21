import z from 'zod'

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

/**
 * What names one favorited thing, for `toggleFavorite` and for the two queries that count them.
 *
 * One schema, because the three of them are the same question and had already drifted: the command
 * coerced its id from a string while the queries required a number, and the comment on each said it
 * matched the other. The id is a number, as it is in the database, and taking a string and calling
 * `Number()` on it is how 'abc' became NaN and a query for `routeFk = null`.
 */
export const favoriteEntityArgs = z.object({
  entityId: z.number().int().positive(),
  entityType: z.enum(FAVORITE_TYPES),
})

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
