import { command, getRequestEvent } from '$app/server'
import { createDrizzleSupabaseClient } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { blocks, routes, topoRoutes, topoRouteTopTypeEnum, topos, type Topo } from '$lib/db/schema'
import { insertActivity } from '$lib/entities/activity/activity.server'
import { authedCommand } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import z from 'zod'
import { deleteFileRows, removeFileStorage, type FileStorageTarget } from '../file/cleanup.server'
import { canEditTopo } from './permissions'

const insertTopoActivity = (
  db: PostgresJsDatabase<typeof schema>,
  user: NonNullable<App.Locals['user']>,
  regionId: number,
  blockId?: null | number,
  areaId?: null | number,
) => {
  if (blockId != null) {
    return insertActivity(db, {
      columnName: 'topo',
      entityId: String(blockId),
      entityType: 'block',
      parentEntityId: areaId == null ? undefined : String(areaId),
      parentEntityType: areaId == null ? undefined : 'area',
      regionFk: regionId,
      type: 'updated',
      userFk: user.id,
    })
  }
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

    await insertTopoActivity(db, user, block.regionFk, block.id, block.areaFk)

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
        with: {
          block: { columns: { areaFk: true } },
          file: { columns: { bunnyStreamFk: true, id: true, path: true } },
        },
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

      await insertTopoActivity(db, user, topo.regionFk, topo.blockFk, topo.block?.areaFk)

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
        with: {
          block: { columns: { areaFk: true } },
          file: { columns: { bunnyStreamFk: true, id: true, path: true } },
        },
      })
      if (topo == null) {
        error(404, 'Topo not found')
      }
      if (!canEditTopo(userRegions, topo)) {
        error(403, 'Not allowed to edit topos here')
      }

      await db.update(topos).set({ fileFk: fileId }).where(eq(topos.id, topoId))
      const targets = topo.file == null ? [] : await deleteFileRows(db, [topo.file])

      await insertTopoActivity(db, user, topo.regionFk, topo.blockFk, topo.block?.areaFk)

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
    const own = await db.query.topos.findMany({ columns: { id: true }, where: eq(topos.blockFk, blockId) })
    const ownIds = new Set(own.map((topo) => topo.id))

    for (const [index, id] of orderedIds.filter((id) => ownIds.has(id)).entries()) {
      await db.update(topos).set({ order: index }).where(eq(topos.id, id))
    }

    await insertTopoActivity(db, user, block.regionFk, block.id, block.areaFk)
  },
)

const topoLineSchema = z.object({
  path: z.string(),
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
    const topo = await db.query.topos.findFirst({
      where: eq(topos.id, topoId),
      with: { block: { columns: { areaFk: true } } },
    })
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
            columns: { deletedAt: true, id: true },
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
    for (const row of existing) {
      const hasPath = row.path != null && row.path.trim() !== ''
      if (row.routeFk != null && liveRouteIds.has(row.routeFk) && hasPath && !desiredRoutes.has(row.routeFk)) {
        await db.delete(topoRoutes).where(eq(topoRoutes.id, row.id))
      }
    }

    await insertTopoActivity(db, user, topo.regionFk, topo.blockFk, topo.block?.areaFk)
  },
)
