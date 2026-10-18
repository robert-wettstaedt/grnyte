import { asCaller, defineServerMutator } from '$lib/zero/serverMutator.server'
import { favoriteSetArgs } from './dto'
import { setFavorite } from './favorite.server'

export const favoritesServerMutatorDefs = {
  favorites: {
    set: defineServerMutator(favoriteSetArgs, async ({ args, ctx, tx }) => {
      await asCaller(tx, ctx, (db) => setFavorite(args, { db, user: ctx.user, userRegions: ctx.userRegions }))
    }),
  },
}
