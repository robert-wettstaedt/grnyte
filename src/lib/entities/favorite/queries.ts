import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const favoritesQueryDefs = {
  // Everyone's favorites for one entity — used to count how many people saved it.
  listEntityFavorites: defineQuery(
    z.object({ entityId: z.string(), entityType: z.enum(['block', 'route', 'area']) }),
    regionMemberCan(({ args }) => zql.favorites.where('entityType', args.entityType).where('entityId', args.entityId)),
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
    z.object({ entityId: z.string(), entityType: z.enum(['block', 'route', 'area']), userId: z.number() }),
    regionMemberCan(({ args }) =>
      zql.favorites.where('userFk', args.userId).where('entityType', args.entityType).where('entityId', args.entityId),
    ),
  ),

  listUserFavorites: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.favorites.where('userFk', args.userId).where('entityType', 'route')),
  ),
}
