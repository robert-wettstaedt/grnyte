import { command, getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { blocks, routes, topoRoutes, topoRouteTopTypeEnum, topos, type Topo } from '$lib/db/schema'
import { createUpdateEvent, insertEvent } from '$lib/entities/event/event.server'
import { authedCommand } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import z from 'zod'
import { deleteFileRows, removeFileStorage, type FileStorageTarget } from '../file/cleanup.server'
import { stringifyTopoChange, stringifyTopoLines, type TopoAction } from './change'
import { canEditTopo } from './permissions'

/** Where a topo change lands in the feed: on the block, since a topo has no page or row of its
 *  own. The area is reachable from there through `blocks.area_fk`. */
interface TopoEventTarget {
  blockId?: null | number
  regionId: number
  /** Absent for a reorder: it is the strip that changed, not a photo. */
  topoId?: number
}

/**
 * Log a topo change that has no before/after pair: a photo added, swapped, removed, or the
 * strip reordered. What happened is in the metadata, because the row has nothing else to
 * say it with - all five of these used to write the same valueless row, and the feed could
 * only report the union of them ("Topo redrawn").
 */
const insertTopoEvent = (
  db: PostgresJsDatabase<typeof schema>,
  user: NonNullable<App.Locals['user']>,
  action: Exclude<TopoAction, 'lines'>,
  { blockId, regionId, topoId }: TopoEventTarget,
) => {
  if (blockId == null) {
    return
  }

  // The block is the object; its area is reachable through `blocks.area_fk`. What the change is
  // ABOUT rides in metadata, which is also what scopes the fold: two topos on one block are two
  // events rather than one that quietly absorbs the second.
  return insertEvent(db, {
    actorFk: user.id,
    metadata: stringifyTopoChange({ action, topoId }),
    object: { id: blockId, type: 'block' },
    regionFk: regionId,
    verb: action === 'photoRemoved' ? 'remove' : 'update',
  })
}

/**
 * Create a topo from an already-finalized image. The image is uploaded via the shared flow with
 * `entityType: 'block'` (topo images are block-attached `files` rows stored under `/topos`), then
 * this inserts the `topos` row pointing at it, appended after the block's existing photos.
 * ponytail: two calls (finalizeImage then createTopo) leave a brief orphan window if createTopo
 * fails; the file is a normal block image swept by the same cleanup story. Upgrade = fold finalize
 * into this command if the window ever bites.
 */
export const createTopo = authedCommand(
  z.object({ blockId: z.number(), fileId: z.string().min(1) }),
  async ({ blockId, fileId }, { db, user, userRegions }): Promise<MutationResult<Topo>> => {
    const block = await db.query.blocks.findFirst({ where: eq(blocks.id, blockId) })
    if (block == null) {
      error(404, 'Block not found')
    }
    if (!canEditTopo(userRegions, block)) {
      error(403, 'Not allowed to edit topos here')
    }

    const existing = await db.query.topos.findMany({ columns: { order: true }, where: eq(topos.blockFk, blockId) })
    const nextOrder = existing.reduce((max, topo) => Math.max(max, topo.order ?? 0), 0) + 1

    const [created] = await db
      .insert(topos)
      .values({ blockFk: blockId, fileFk: fileId, order: nextOrder, regionFk: block.regionFk })
      .returning()
    if (created == null) {
      error(500, 'Failed to create topo')
    }

    await insertTopoEvent(db, user, 'photoAdded', {
      blockId: block.id,
      regionId: block.regionFk,
      topoId: created.id,
    })

    return { data: created }
  },
)

/**
 * Delete a topo: its lines, the row, and its backing image. Hand-wired like `deleteFile` so the
 * irreversible storage removal runs only after the DB delete commits.
 */
export const deleteTopo = command(
  z.object({ id: z.number() }),
  async ({ id }): Promise<MutationResult<{ id: number }>> => {
    const { supabase, user, userRegions } = getRequestEvent().locals
    if (user == null) {
      error(401, 'Not authenticated')
    }
    const rls = await createDrizzleSupabaseClient(supabase)

    const storage = await rls(async (db): Promise<FileStorageTarget[]> => {
      const topo = await db.query.topos.findFirst({
        where: eq(topos.id, id),
        with: { file: { columns: { bunnyStreamFk: true, id: true, path: true } } },
      })
      if (topo == null) {
        error(404, 'Topo not found')
      }
      if (!canEditTopo(userRegions, topo)) {
        error(403, 'Not allowed to edit topos here')
      }

      // topo_routes → topos → files: FK order matters (routes reference the topo, the topo the file).
      await db.delete(topoRoutes).where(eq(topoRoutes.topoFk, id))
      await db.delete(topos).where(eq(topos.id, id))
      const targets = topo.file == null ? [] : await deleteFileRows(db, [topo.file])

      await insertTopoEvent(db, user, 'photoRemoved', {
        blockId: topo.blockFk,
        regionId: topo.regionFk,
        topoId: id,
      })

      return targets
    })

    await removeFileStorage(storage)

    return { data: { id } }
  },
)

/**
 * Swap a topo's image for a newly-finalized one, keeping its lines. Coordinates are normalized
 * (0–1), so they stay proportional on the new photo. The old image is removed post-commit.
 */
export const replaceTopoImage = command(
  z.object({ fileId: z.string().min(1), topoId: z.number() }),
  async ({ fileId, topoId }): Promise<MutationResult<{ id: number }>> => {
    const { supabase, user, userRegions } = getRequestEvent().locals
    if (user == null) {
      error(401, 'Not authenticated')
    }
    const rls = await createDrizzleSupabaseClient(supabase)

    const storage = await rls(async (db): Promise<FileStorageTarget[]> => {
      const topo = await db.query.topos.findFirst({
        where: eq(topos.id, topoId),
        with: { file: { columns: { bunnyStreamFk: true, id: true, path: true } } },
      })
      if (topo == null) {
        error(404, 'Topo not found')
      }
      if (!canEditTopo(userRegions, topo)) {
        error(403, 'Not allowed to edit topos here')
      }

      await db.update(topos).set({ fileFk: fileId }).where(eq(topos.id, topoId))
      const targets = topo.file == null ? [] : await deleteFileRows(db, [topo.file])

      await insertTopoEvent(db, user, 'photoReplaced', {
        blockId: topo.blockFk,
        regionId: topo.regionFk,
        topoId,
      })

      return targets
    })

    await removeFileStorage(storage)

    return { data: { id: topoId } }
  },
)

/** Persist a new photo order for a block (drag-reorder). Order = index in the given list. */
export const reorderTopos = authedCommand(
  z.object({ blockId: z.number(), orderedIds: z.array(z.number()) }),
  async ({ blockId, orderedIds }, { db, user, userRegions }) => {
    const block = await db.query.blocks.findFirst({ where: eq(blocks.id, blockId) })
    if (block == null) {
      error(404, 'Block not found')
    }
    if (!canEditTopo(userRegions, block)) {
      error(403, 'Not allowed to edit topos here')
    }

    // Only reorder the block's own topos — a stale client snapshot (or a crafted call)
    // may contain ids of deleted topos or of another block entirely.
    const own = await db.query.topos.findMany({ columns: { id: true, order: true }, where: eq(topos.blockFk, blockId) })
    const ownIds = new Set(own.map((topo) => topo.id))

    // Renumber ALL of the block's topos 0..n-1: the client's order first, then any own topos
    // it omitted (a stale snapshot missing a just-created photo) appended in their current order.
    // Numbering only the listed ids would leave an omitted topo on a stale `order` that collides
    // with a new index.
    const wanted = orderedIds.filter((id) => ownIds.has(id))
    const wantedSet = new Set(wanted)
    const tail = own
      .filter((topo) => !wantedSet.has(topo.id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((topo) => topo.id)

    for (const [index, id] of [...wanted, ...tail].entries()) {
      await db.update(topos).set({ order: index }).where(eq(topos.id, id))
    }

    await insertTopoEvent(db, user, 'reordered', { blockId: block.id, regionId: block.regionFk })
  },
)

const topoLineSchema = z.object({
  // `M x,y L x,y … Z`, and nothing else. The feed encodes a set of these into one string
  // and slices it back apart on the separators, so a path holding one would re-slice the
  // entry it sits in; `convertPathToPoints` reads no other notation either.
  path: z.string().regex(/^[mlz0-9.,\- ]*$/i, 'Unsupported path notation'),
  routeFk: z.number(),
  topType: z.enum(topoRouteTopTypeEnum),
})

/**
 * Save the full line set for a topo in one shot — the batched dirty session's Save. Upserts each
 * line by `routeFk` (a route has at most one line per photo) and deletes lines no longer present.
 */
export const saveTopoLines = authedCommand(
  z.object({ lines: z.array(topoLineSchema), topoId: z.number() }),
  async ({ lines, topoId }, { db, user, userRegions }) => {
    const topo = await db.query.topos.findFirst({ where: eq(topos.id, topoId) })
    if (topo == null) {
      error(404, 'Topo not found')
    }
    if (!canEditTopo(userRegions, topo)) {
      error(403, 'Not allowed to edit topos here')
    }

    // Lines may only reference one of the block's own LIVE routes — regionFk is stamped from
    // the topo, so an unchecked routeFk would let a crafted call attach a foreign route, and a
    // soft-deleted route must not gain a fresh line (it is on its way out, see the delete loop).
    const blockRoutes =
      topo.blockFk == null
        ? []
        : await db.query.routes.findMany({
            // `name` is only for the feed: the change line names the routes whose lines were
            // drawn, erased or moved, which no id would tell the reader.
            columns: { deletedAt: true, id: true, name: true },
            where: eq(routes.blockFk, topo.blockFk),
          })
    const liveRouteIds = new Set(blockRoutes.filter((route) => route.deletedAt == null).map((route) => route.id))
    if (lines.some((line) => !liveRouteIds.has(line.routeFk))) {
      error(400, 'Route is not on this block')
    }

    // Last-writer-wins dedupe: a payload with the same routeFk twice must not create two rows
    // for one route on one photo (the UI can't then remove the duplicate).
    const linesByRoute = new Map(lines.map((line) => [line.routeFk, line]))
    const desiredRoutes = new Set(linesByRoute.keys())

    const existing = await db.query.topoRoutes.findMany({ where: eq(topoRoutes.topoFk, topoId) })
    const existingByRoute = new Map(existing.map((row) => [row.routeFk, row]))

    for (const line of linesByRoute.values()) {
      const row = existingByRoute.get(line.routeFk)
      if (row == null) {
        await db.insert(topoRoutes).values({
          path: line.path,
          regionFk: topo.regionFk,
          routeFk: line.routeFk,
          topoFk: topoId,
          topType: line.topType,
        })
      } else if (row.path !== line.path || row.topType !== line.topType) {
        await db.update(topoRoutes).set({ path: line.path, topType: line.topType }).where(eq(topoRoutes.id, row.id))
      }
    }

    // Delete only lines the user could actually see and remove: a drawn line (non-empty path)
    // on a live route that is no longer in the set. Path-less association rows and rows for
    // soft-deleted routes are invisible in the editor, so leave them (a path-less row would be
    // hard-deleted out from under `deleteRoute`; a deleted route's line must survive for restore).
    const erased = (row: { path: null | string; routeFk: null | number }) =>
      row.routeFk != null &&
      liveRouteIds.has(row.routeFk) &&
      row.path != null &&
      row.path.trim() !== '' &&
      !desiredRoutes.has(row.routeFk)

    for (const row of existing) {
      if (erased(row)) {
        await db.delete(topoRoutes).where(eq(topoRoutes.id, row.id))
      }
    }

    // The lines this photo carried before and after, which is the one topo change that has a
    // real before/after pair. `createUpdateEvent` writes only when the two differ (so a
    // Save that moved nothing logs nothing) and folds a second save within the window into
    // the first row, keeping its original `oldValue`: draw, save, redraw, save reads as one
    // change from where the photo started to where it ended up.
    //
    // The after side is the rows this call LEAVES BEHIND rather than the payload it was
    // handed, and neither side is filtered by what is live. A route soft-deleted between two
    // saves drops out of the editor and out of the second payload, but its line row survives
    // (the loop above skips it), so reading the payload would report it as erased. Under the
    // fold that reaches a reader: the first row keeps an `oldValue` that still names the
    // route, and the card grows a red "Erased X" chip for an erase nobody performed.
    const routeNames = new Map(blockRoutes.map((route) => [route.id, route.name]))
    const drawn = (line: { path: null | string; routeFk: null | number; topType: string }) =>
      line.routeFk != null && line.path != null && line.path.trim() !== ''
        ? [{ name: routeNames.get(line.routeFk) ?? '', path: line.path, routeFk: line.routeFk, topType: line.topType }]
        : []

    // The upserted lines speak for the rows they replaced, so those are dropped from the kept set.
    const kept = existing.filter((row) => !erased(row) && !(row.routeFk != null && desiredRoutes.has(row.routeFk)))

    if (topo.blockFk != null) {
      await createUpdateEvent(db, {
        actorFk: user.id,
        metadata: stringifyTopoChange({ action: 'lines', topoId }),
        newEntity: { topo: stringifyTopoLines([...kept, ...linesByRoute.values()].flatMap(drawn)) },
        object: { id: topo.blockFk, type: 'block' },
        oldEntity: { topo: stringifyTopoLines(existing.flatMap(drawn)) },
        regionFk: topo.regionFk,
      })
    }
  },
)
