import { resolve } from '$app/paths'
import { areas, blocks, files, geolocations, routes, topos, type Block } from '$lib/db/schema'
import { formError, optionalCoordinate, stringToInt } from '$lib/forms/schemas'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error, invalid } from '@sveltejs/kit'
import { and, count, eq, gt, gte, isNull, sql } from 'drizzle-orm'
import z from 'zod'
import { createUpdateActivity, deleteActivity, insertActivity } from '../activity/activity.server'
import { refreshAreaType } from '../area/area.server'
import { canAddBlock } from '../area/permissions'
import { canDeleteBlock, canEditBlock } from './permissions'

const blockActionSchema = z.object({
  areaId: stringToInt,
  id: stringToInt.optional(),
  lat: optionalCoordinate(90),
  long: optionalCoordinate(180),
  name: z.string().trim().optional().default(''),
})

/** Field shape the shared add/edit-block form binds to — `id` is set only when editing. */
export type BlockFormInput = z.input<typeof blockActionSchema>

/** Create a block under a crag (or a still-untyped area, which a block turns into a crag).
 *  Location is optional — when given, a geolocation row is created and linked both ways. */
export const createBlock = authedForm(blockActionSchema, async (value, { db, user, userRegions }, issue) => {
  const area = await db.query.areas.findFirst({ where: eq(areas.id, value.areaId) })

  if (area == null) {
    invalid(formError('area_parentNotFound'))
  }

  if (!canAddBlock(userRegions, area)) {
    invalid(formError('form_noPermission'))
  }

  // Reject a duplicate name in the same area. Skip blank names: those render as
  // "Block {order}" (see the mapper), so several unnamed blocks are fine.
  const existingBlock =
    value.name.length === 0
      ? null
      : await db.query.blocks.findFirst({
          where: (table, { and, eq }) => and(eq(table.name, value.name), eq(table.areaFk, value.areaId)),
        })

  if (existingBlock != null) {
    invalid(issue.name(formError('blocks_nameExists', { name: existingBlock.name })))
  }

  const [blocksCount] = await db
    .select({ count: count() })
    .from(blocks)
    .where(and(eq(blocks.areaFk, value.areaId), isNull(blocks.deletedAt)))

  // Optional location: a geolocation row the block points at via `geolocationFk`.
  let geolocationFk: number | undefined
  if (value.lat != null && value.long != null) {
    const [geolocation] = await db
      .insert(geolocations)
      .values({ lat: value.lat, long: value.long, regionFk: area.regionFk })
      .returning()
    geolocationFk = geolocation.id
  }

  const [block] = await db
    .insert(blocks)
    .values({
      areaFk: value.areaId,
      createdBy: user.id,
      geolocationFk,
      name: value.name,
      order: blocksCount.count + 1,
      regionFk: area.regionFk,
    })
    .returning()

  if (geolocationFk != null) {
    // Back-link the geolocation to its block (mirrors parking's areaFk link).
    await db.update(geolocations).set({ blockFk: block.id }).where(eq(geolocations.id, geolocationFk))
  }

  await refreshAreaType(db, value.areaId)

  await insertActivity(db, {
    type: 'created',
    userFk: user.id,
    entityId: String(block.id),
    entityType: 'block',
    parentEntityId: String(value.areaId),
    parentEntityType: 'area',
    regionFk: block.regionFk,
  })

  return { redirectTo: resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(block.id) }) }
})

/** Edit a block's name and/or location. Reuses the create form (with `id` set). The location
 *  field is three-way: update the existing pin, attach a new one, or drop it entirely. */
export const updateBlock = authedForm(blockActionSchema, async ({ id, ...value }, { db, user, userRegions }, issue) => {
  const block = id == null ? undefined : await db.query.blocks.findFirst({ where: eq(blocks.id, id) })

  if (block == null) {
    invalid(formError('blocks_notFound'))
  }

  if (!canEditBlock(userRegions, block)) {
    invalid(formError('form_noPermission'))
  }

  // Reject a duplicate name in the same area, excluding this block. Blank names are fine
  // (they render as "Block {order}"), so skip the check when the name is cleared.
  const existingBlock =
    value.name.length === 0
      ? null
      : await db.query.blocks.findFirst({
          where: (table, { and, eq, ne }) =>
            and(eq(table.name, value.name), eq(table.areaFk, block.areaFk), ne(table.id, block.id)),
        })

  if (existingBlock != null) {
    invalid(issue.name(formError('blocks_nameExists', { name: existingBlock.name })))
  }

  // Sync the optional location: move the existing pin, attach a new one, or remove it.
  let geolocationFk = block.geolocationFk
  if (value.lat != null && value.long != null) {
    if (geolocationFk == null) {
      const [geolocation] = await db
        .insert(geolocations)
        .values({ lat: value.lat, long: value.long, regionFk: block.regionFk, blockFk: block.id })
        .returning()
      geolocationFk = geolocation.id
    } else {
      await db.update(geolocations).set({ lat: value.lat, long: value.long }).where(eq(geolocations.id, geolocationFk))
    }

    await insertActivity(db, {
      type: 'updated',
      userFk: user.id,
      entityId: String(block.id),
      entityType: 'block',
      columnName: 'location',
      parentEntityId: String(block.areaFk),
      parentEntityType: 'area',
      regionFk: block.regionFk,
    })
  } else if (geolocationFk != null) {
    // Removed: break the block→geo link first so the row can be deleted.
    await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
    await db.delete(geolocations).where(eq(geolocations.id, geolocationFk))
    geolocationFk = null

    await insertActivity(db, {
      type: 'deleted',
      userFk: user.id,
      entityId: String(block.id),
      entityType: 'block',
      columnName: 'location',
      parentEntityId: String(block.areaFk),
      parentEntityType: 'area',
      regionFk: block.regionFk,
    })
  }

  await db.update(blocks).set({ name: value.name, geolocationFk }).where(eq(blocks.id, block.id))

  if (block.name !== value.name) {
    await createUpdateActivity({
      db,
      entityId: String(block.id),
      entityType: 'block',
      newEntity: { name: value.name },
      oldEntity: { name: block.name },
      userFk: user.id,
      parentEntityId: String(block.areaFk),
      parentEntityType: 'area',
      regionFk: block.regionFk,
    })
  }

  return { redirectTo: resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(block.id) }) }
})

/** Move-on-the-map shortcut: set the block's pin straight from the picker, skipping the
 *  edit form. Upserts the geolocation (and links it on first set), then returns to the block. */
export const setBlockLocation = authedCommand(
  z.object({ id: z.number(), lat: z.number(), long: z.number() }),
  async (value, { db, user, userRegions }) => {
    const block = await db.query.blocks.findFirst({ where: eq(blocks.id, value.id) })

    if (block == null) {
      error(404, 'Block not found')
    }

    if (!canEditBlock(userRegions, block)) {
      error(403, formError('form_noPermission'))
    }

    if (block.geolocationFk == null) {
      const [geolocation] = await db
        .insert(geolocations)
        .values({ lat: value.lat, long: value.long, regionFk: block.regionFk, blockFk: block.id })
        .returning()
      await db.update(blocks).set({ geolocationFk: geolocation.id }).where(eq(blocks.id, block.id))
    } else {
      await db
        .update(geolocations)
        .set({ lat: value.lat, long: value.long })
        .where(eq(geolocations.id, block.geolocationFk))
    }

    await insertActivity(db, {
      type: 'updated',
      userFk: user.id,
      entityId: String(block.id),
      entityType: 'block',
      columnName: 'location',
      parentEntityId: String(block.areaFk),
      parentEntityType: 'area',
      regionFk: block.regionFk,
    })

    return { redirectTo: resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(block.id) }) }
  },
)

/** Snapshot {@link deleteBlock} returns so {@link restoreBlock} can undo either delete path.
 *  The hard path carries `order` so the restore can slot the block back where it was. */
type DeleteBlockSnapshot =
  | {
      mode: 'hard'
      blockId: number
      areaFk: number
      block: Pick<Block, 'name' | 'order' | 'regionFk'>
      geolocation: { lat: number; long: number } | null
    }
  | { mode: 'soft'; blockId: number; deletedAt: Date }

/** Close the gap a removed block leaves: pull every later sibling in the area down one, so the
 *  visible blocks stay contiguously ordered (keeping "Block N" labels sensible). */
async function shiftBlockOrdersDown(db: Context['db'], areaFk: number, fromOrder: number): Promise<void> {
  await db
    .update(blocks)
    .set({ order: sql`${blocks.order} - 1` })
    .where(and(eq(blocks.areaFk, areaFk), isNull(blocks.deletedAt), gt(blocks.order, fromOrder)))
}

/** Open a slot at `fromOrder` for a block being restored: push every sibling at or after it up
 *  one, so the restored block lands at exactly its original order. */
async function shiftBlockOrdersUp(db: Context['db'], areaFk: number, fromOrder: number): Promise<void> {
  await db
    .update(blocks)
    .set({ order: sql`${blocks.order} + 1` })
    .where(and(eq(blocks.areaFk, areaFk), isNull(blocks.deletedAt), gte(blocks.order, fromOrder)))
}

/** Hard-delete a bare block: drop its pin (FK-linked both ways) then the row. Returns the
 *  snapshot — including `order` — that {@link restoreBlock} recreates it from. */
async function hardDeleteBlock(db: Context['db'], block: Block): Promise<DeleteBlockSnapshot> {
  const geolocation =
    block.geolocationFk == null
      ? null
      : await db.query.geolocations.findFirst({ where: eq(geolocations.id, block.geolocationFk) })

  if (block.geolocationFk != null) {
    // Break the block→geo link first so the row can be deleted.
    await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
    await db.delete(geolocations).where(eq(geolocations.id, block.geolocationFk))
  }
  await db.delete(blocks).where(eq(blocks.id, block.id))

  return {
    mode: 'hard',
    blockId: block.id,
    areaFk: block.areaFk,
    block: { name: block.name, order: block.order, regionFk: block.regionFk },
    geolocation: geolocation == null ? null : { lat: geolocation.lat, long: geolocation.long },
  }
}

/** Soft-delete a block with descendants: stamp one `deletedAt` on it and its routes (the shared
 *  restore key). The block keeps its `order`, so a restore can slot it back exactly.
 *  ponytail: timestamp as restore key; sub-ms collision with a concurrent delete is the
 *  ceiling. Upgrade = a dedicated deletion-batch id column. */
async function softDeleteBlock(db: Context['db'], block: Block): Promise<DeleteBlockSnapshot> {
  const deletedAt = new Date()
  await db
    .update(blocks)
    .set({ deletedAt })
    .where(and(eq(blocks.id, block.id), isNull(blocks.deletedAt)))
  await db
    .update(routes)
    .set({ deletedAt })
    .where(and(eq(routes.blockFk, block.id), isNull(routes.deletedAt)))

  return { mode: 'soft', blockId: block.id, deletedAt }
}

/** Delete a block. A bare block (no routes, topos or files) is hard-deleted with a snapshot;
 *  one with descendants is soft-deleted. Either way the remaining siblings close the gap so
 *  their `order` stays contiguous. Returns the snapshot {@link restoreBlock} undoes from. */
export const deleteBlock = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteBlockSnapshot>> => {
    const block = await db.query.blocks.findFirst({ where: eq(blocks.id, id) })

    if (block == null) {
      error(404, 'Block not found')
    }

    if (!canDeleteBlock(userRegions, block)) {
      error(403, formError('form_noPermission'))
    }

    // Routes/topos/files FK-reference the block; a block with any of them is soft-deleted so
    // undo restores them cleanly (and so the hard delete never hits a FK constraint).
    const [route, topo, file] = await Promise.all([
      db.query.routes.findFirst({ columns: { id: true }, where: eq(routes.blockFk, id) }),
      db.query.topos.findFirst({ columns: { id: true }, where: eq(topos.blockFk, id) }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.blockFk, id) }),
    ])

    const data =
      route == null && topo == null && file == null
        ? await hardDeleteBlock(db, block)
        : await softDeleteBlock(db, block)

    // Close the gap the block leaves; the soft-deleted block keeps its own `order` for restore.
    await shiftBlockOrdersDown(db, block.areaFk, block.order)

    await insertActivity(db, {
      type: 'deleted',
      userFk: user.id,
      entityId: String(block.id),
      entityType: 'block',
      oldValue: block.name,
      parentEntityId: String(block.areaFk),
      parentEntityType: 'area',
      regionFk: block.regionFk,
    })
    await refreshAreaType(db, block.areaFk)

    return { redirectTo: resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(block.areaFk) }), data }
  },
)

const restoreBlockSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('hard'),
    blockId: z.number(),
    areaFk: z.number(),
    block: z.object({ name: z.string(), order: z.number(), regionFk: z.number() }),
    geolocation: z.object({ lat: z.number(), long: z.number() }).nullable(),
  }),
  z.object({ mode: z.literal('soft'), blockId: z.number(), deletedAt: z.coerce.date() }),
])

/** Recreate a hard-deleted block at its original `order`, re-linking its pin. Opens the slot
 *  first so the block lands exactly where it was. Returns the new block id. */
async function hardRestoreBlock(
  db: Context['db'],
  snapshot: Extract<DeleteBlockSnapshot, { mode: 'hard' }>,
  createdBy: number,
): Promise<number> {
  await shiftBlockOrdersUp(db, snapshot.areaFk, snapshot.block.order)

  const [created] = await db
    .insert(blocks)
    .values({ ...snapshot.block, areaFk: snapshot.areaFk, createdBy })
    .returning()

  if (snapshot.geolocation != null) {
    const [geo] = await db
      .insert(geolocations)
      .values({ ...snapshot.geolocation, regionFk: snapshot.block.regionFk, blockFk: created.id })
      .returning()
    await db.update(blocks).set({ geolocationFk: geo.id }).where(eq(blocks.id, created.id))
  }

  return created.id
}

/** Un-soft-delete a block and its routes, slotting it back at the `order` it kept. Opens the
 *  slot among the visible siblings first (the block itself is still `deletedAt` at that point). */
async function softRestoreBlock(
  db: Context['db'],
  snapshot: Extract<DeleteBlockSnapshot, { mode: 'soft' }>,
  block: Block,
): Promise<void> {
  await shiftBlockOrdersUp(db, block.areaFk, block.order)
  await db.update(blocks).set({ deletedAt: null }).where(eq(blocks.deletedAt, snapshot.deletedAt))
  await db.update(routes).set({ deletedAt: null }).where(eq(routes.deletedAt, snapshot.deletedAt))
}

/** Undo a {@link deleteBlock}: recreate the hard-deleted block (with its pin) or clear the
 *  `deletedAt` the soft delete stamped — either way slotting it back at its original order, and
 *  removing the 'deleted' activity so the timeline reads as if it never happened. */
export const restoreBlock = authedCommand(restoreBlockSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    if (!canDeleteBlock(userRegions, snapshot.block)) {
      error(403, formError('form_noPermission'))
    }

    const blockId = await hardRestoreBlock(db, snapshot, user.id)

    await refreshAreaType(db, snapshot.areaFk)
    await deleteActivity(db, { entityId: String(snapshot.blockId), entityType: 'block', type: 'deleted' })

    return {
      redirectTo: resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(blockId) }),
      data: { blockId },
    }
  }

  const block = await db.query.blocks.findFirst({ where: eq(blocks.id, snapshot.blockId) })

  if (block == null || !canDeleteBlock(userRegions, block)) {
    error(403, formError('form_noPermission'))
  }

  await softRestoreBlock(db, snapshot, block)

  await refreshAreaType(db, block.areaFk)
  await deleteActivity(db, { entityId: String(snapshot.blockId), entityType: 'block', type: 'deleted' })

  return {
    redirectTo: resolve('/(app)/(shell)/(map)/blocks/[id]', { id: String(snapshot.blockId) }),
    data: { blockId: snapshot.blockId },
  }
})
