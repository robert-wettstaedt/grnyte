import { favoriteEntityType, favorites } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { and, eq } from 'drizzle-orm'
import z from 'zod'

/**
 * Add or remove the current user's favorite for an entity. Returns the new saved
 * state as the envelope's `data` so the caller can confirm (or revert) an optimistic toggle.
 */
export const toggleFavorite = authedCommand(
  z.object({
    entityId: z.string(),
    entityType: z.enum(favoriteEntityType),
    regionFk: z.number(),
  }),
  async ({ entityId, entityType, regionFk }, { db, user }) => {
    const existing = await db.query.favorites.findFirst({
      where: and(eq(favorites.userFk, user.id), eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)),
    })

    if (existing == null) {
      await db
        .insert(favorites)
        .values({ authUserFk: user.authUserFk, entityId, entityType, regionFk, userFk: user.id })

      return { data: true }
    }

    await db.delete(favorites).where(eq(favorites.id, existing.id))

    return { data: false }
  },
)
