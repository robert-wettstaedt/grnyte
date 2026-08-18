import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'
import { FAVORITE_KEY, FAVORITE_TYPES } from './dto'

// The id is a number here as it is in the database and in `toggleFavorite`: taking a string and
// calling `Number()` on it is how 'abc' became NaN and a query for `routeFk = null`.
const entityArgs = z.object({ entityId: z.number().int().positive(), entityType: z.enum(FAVORITE_TYPES) })

export const favoritesQueryDefs = {
  // Everyone's favorites for one entity — used to count how many people saved it.
  listEntityFavorites: defineQuery(
    entityArgs,
    regionMemberCan(({ args }) => zql.favorites.where(FAVORITE_KEY[args.entityType], args.entityId)),
  ),

  // A user's favorites across all entity types, newest first — the profile's
  // Favorites section. Separate from listUserFavorites (route-only, feeds the map
  // favorites filter) so neither query has to carry the other's rows.
  listUserAllFavorites: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.favorites.where('userFk', args.userId).orderBy('createdAt', 'desc')),
  ),

  // The current user's favorite for one specific entity — empty when not saved.
  listUserEntityFavorites: defineQuery(
    entityArgs.extend({ userId: z.number() }),
    regionMemberCan(({ args }) =>
      zql.favorites.where('userFk', args.userId).where(FAVORITE_KEY[args.entityType], args.entityId),
    ),
  ),

  listUserFavorites: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.favorites.where('userFk', args.userId).where('routeFk', 'IS NOT', null)),
  ),
}
