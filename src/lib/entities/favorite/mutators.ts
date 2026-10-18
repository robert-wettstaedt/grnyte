import type { QueryContext } from '$lib/zero/permissions'
import { zql } from '$lib/zero/zero-schema.gen'
import { defineMutator } from '@rocicorp/zero'
import { FAVORITE_KEY, favoriteSetArgs } from './dto'

export const favoritesMutatorDefs = {
  favorites: {
    set: defineMutator(favoriteSetArgs, async ({ args, ctx, tx }) => {
      const key = FAVORITE_KEY[args.entityType]
      const existing = await tx.run(zql.favorites.where('userFk', args.userId).where(key, args.entityId).one())

      if (args.saved === (existing != null)) {
        return
      }
      if (existing != null) {
        await tx.mutate.favorites.delete({ id: existing.id })
        return
      }

      const entity = await (args.entityType === 'route'
        ? tx.run(zql.routes.where('id', args.entityId).one())
        : args.entityType === 'block'
          ? tx.run(zql.blocks.where('id', args.entityId).one())
          : tx.run(zql.areas.where('id', args.entityId).one()))

      // Not cached locally: no optimistic row, the server's arrives by sync.
      if (entity == null) {
        return
      }

      // Ids are serial, so the optimistic row takes a negative one, deterministic per entity so a
      // rerun of this mutator lands on the same row. Zero drops it when the server's row arrives.
      await tx.mutate.favorites.insert({
        // shortcut: Zero's context is untyped until `DefaultTypes.context` is registered.
        authUserFk: (ctx as QueryContext | undefined)?.authUserId ?? '',
        createdAt: Date.now(),
        id: -(args.entityId * 3 + Object.keys(FAVORITE_KEY).indexOf(args.entityType) + 1),
        [key]: args.entityId,
        regionFk: entity.regionFk,
        userFk: args.userId,
      })
    }),
  },
}
