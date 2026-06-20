import { regionMemberCan } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineQuery } from '@rocicorp/zero'
import z from 'zod'

export const favoritesQueryDefs = {
  listUserFavorites: defineQuery(
    z.object({ userId: z.number() }),
    regionMemberCan(({ args }) => zql.favorites.where('userFk', args.userId).where('entityType', 'route')),
  ),

  // The current user's favorite for one specific entity — empty when not saved.
  listUserEntityFavorites: defineQuery(
    z.object({ userId: z.number(), entityType: z.enum(['block', 'route', 'area']), entityId: z.string() }),
    regionMemberCan(({ args }) =>
      zql.favorites.where('userFk', args.userId).where('entityType', args.entityType).where('entityId', args.entityId),
    ),
  ),

  // Everyone's favorites for one entity — used to count how many people saved it.
  listEntityFavorites: defineQuery(
    z.object({ entityType: z.enum(['block', 'route', 'area']), entityId: z.string() }),
    regionMemberCan(({ args }) => zql.favorites.where('entityType', args.entityType).where('entityId', args.entityId)),
  ),
}
