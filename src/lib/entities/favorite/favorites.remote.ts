import { areas, blocks, favoriteEntityType, favorites, routes } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
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
  }),
  async ({ entityId, entityType }, { db, user }) => {
    // regionFk is stamped from the entity, never the client: the favorites INSERT RLS is
    // own-row only (no region predicate), so a submitted regionFk would go in unchecked.
    // The lookup runs under RLS, so an entity the user can't read returns undefined -> 404.
    const id = Number(entityId)
    const entity = await (entityType === 'route'
      ? db.query.routes.findFirst({ columns: { regionFk: true }, where: eq(routes.id, id) })
      : entityType === 'block'
        ? db.query.blocks.findFirst({ columns: { regionFk: true }, where: eq(blocks.id, id) })
        : db.query.areas.findFirst({ columns: { regionFk: true }, where: eq(areas.id, id) }))
    if (entity == null) {
      error(404, `${entityType} not found`)
    }

    const existing = await db.query.favorites.findFirst({
      where: and(eq(favorites.userFk, user.id), eq(favorites.entityType, entityType), eq(favorites.entityId, entityId)),
    })

    if (existing == null) {
      await db
        .insert(favorites)
        .values({ authUserFk: user.authUserFk, entityId, entityType, regionFk: entity.regionFk, userFk: user.id })

      return { data: true }
    }

    await db.delete(favorites).where(eq(favorites.id, existing.id))

    return { data: false }
  },
)
