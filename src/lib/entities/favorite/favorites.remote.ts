import { checkRegionPermission, REGION_PERMISSION_READ } from '$lib/auth'
import { areas, blocks, favorites, routes } from '$lib/db/schema'
import { authedCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { and, eq } from 'drizzle-orm'
import { favoriteEntityArgs } from './dto'

/**
 * Add or remove the current user's favorite for an entity. Returns the new saved
 * state as the envelope's `data` so the caller can confirm (or revert) an optimistic toggle.
 */
export const toggleFavorite = authedCommand(
  favoriteEntityArgs,
  async ({ entityId, entityType }, { db, user, userRegions }) => {
    // regionFk is stamped from the entity, never the client: the favorites INSERT policy is
    // own-row only (no region predicate), so a submitted regionFk would go in unchecked.
    const entity = await (entityType === 'route'
      ? db.query.routes.findFirst({ columns: { regionFk: true }, where: eq(routes.id, entityId) })
      : entityType === 'block'
        ? db.query.blocks.findFirst({ columns: { regionFk: true }, where: eq(blocks.id, entityId) })
        : db.query.areas.findFirst({ columns: { regionFk: true }, where: eq(areas.id, entityId) }))

    // "No such row" and "not in a region you may read" are one and the same 404, deliberately. Only
    // RLS used to make the second half true: an entity in a foreign region simply came back
    // undefined here. With the check in the handler the refusal is ours, and it stays a 404 rather
    // than becoming a 403, because two statuses would make this command an existence oracle: a
    // stranger could walk the id space and learn exactly which routes, blocks and areas exist in
    // regions they cannot open. The favorite itself is own-row, so there is nothing else to say.
    if (entity == null || !checkRegionPermission(userRegions, [REGION_PERMISSION_READ], entity.regionFk)) {
      error(404, `${entityType} not found`)
    }

    const objectColumn =
      entityType === 'route' ? favorites.routeFk : entityType === 'block' ? favorites.blockFk : favorites.areaFk

    const existing = await db.query.favorites.findFirst({
      where: and(eq(favorites.userFk, user.id), eq(objectColumn, entityId)),
    })

    if (existing == null) {
      // `onConflictDoNothing` because this reads before it writes: two devices tapping Save at the
      // same moment both see nothing and both insert, and the unique index would turn the loser
      // into an error over a state it already agrees with.
      //
      // Saved either way, so `true` either way. The three unique indexes are per (user, object), so
      // a conflict can only ever be this caller's own row: the loser of that race is looking at the
      // favorite it was asking for. Reporting what the INSERT returned instead would answer `false`
      // on a row that exists and leave the button drawn unsaved.
      await db
        .insert(favorites)
        // Every column named, and the two the request did not ask for written as NULL rather than
        // left out: `favorites_one_object` counts what is set, so which of the three is which is
        // the whole shape of the row.
        .values({
          areaFk: entityType === 'area' ? entityId : null,
          authUserFk: user.authUserFk,
          blockFk: entityType === 'block' ? entityId : null,
          regionFk: entity.regionFk,
          routeFk: entityType === 'route' ? entityId : null,
          userFk: user.id,
        })
        .onConflictDoNothing()

      return { data: true }
    }

    await db.delete(favorites).where(eq(favorites.id, existing.id))

    return { data: false }
  },
)
