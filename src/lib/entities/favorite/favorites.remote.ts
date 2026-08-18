import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth'
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
    // Digits only. The column is still text here (the foreign-key reshape lands with the migration
    // chain), but everything downstream compares it to an integer id, and `Number('abc')` is NaN:
    // Postgres rejects that with 22P02 and the handler 500s before reaching the `entity == null`
    // branch that owns the deliberate single-404 answer below.
    entityId: z.string().regex(/^\d+$/),
    entityType: z.enum(favoriteEntityType),
  }),
  async ({ entityId, entityType }, { db, user, userRegions }) => {
    // regionFk is stamped from the entity, never the client: the favorites INSERT RLS is
    // own-row only (no region predicate), so a submitted regionFk would go in unchecked.
    const id = Number(entityId)
    const entity = await (entityType === 'route'
      ? db.query.routes.findFirst({ columns: { regionFk: true }, where: eq(routes.id, id) })
      : entityType === 'block'
        ? db.query.blocks.findFirst({ columns: { regionFk: true }, where: eq(blocks.id, id) })
        : db.query.areas.findFirst({ columns: { regionFk: true }, where: eq(areas.id, id) }))

    // "No such row" and "not in a region you may read" are one and the same 404, deliberately. Only
    // RLS used to make the second half true: an entity in a foreign region simply came back
    // undefined here. With the check in the handler the refusal is ours, and it stays a 404 rather
    // than becoming a 403, because two statuses would make this command an existence oracle: a
    // stranger could walk the id space and learn exactly which routes, blocks and areas exist in
    // regions they cannot open. The favorite itself is own-row, so there is nothing else to say.
    if (entity == null || !checkRegionPermission(userRegions, [REGION_PERMISSION_READ], entity.regionFk)) {
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
