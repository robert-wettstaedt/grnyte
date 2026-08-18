import { resolve } from '$app/paths'
import { areas, blocks, files, geolocations, routes, topos, type Area, type Block } from '$lib/db/schema'
import { boundedDegrees, formError, optionalCoordinate, stringToInt } from '$lib/forms/schemas'
import { stringifyCoords } from '$lib/map/coords'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { requireRow, requireRowForm } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { and, count, eq, gt, gte, isNull, sql } from 'drizzle-orm'
import z from 'zod'
import { refreshAreaType } from '../area/area.server'
import { canAddBlock } from '../area/permissions'
import { canHardDelete, createUpdateEvent, deleteEvent, insertEvent } from '../event/event.server'
import { stringifyDeletionScale } from '../event/verbs'
import { canDeleteBlock, canEditBlock } from './permissions'

const blockActionSchema = z.object({
  areaId: stringToInt,
  // Checkbox-style hidden input: "true" when the pin is a rough guess, absent otherwise.
  estimated: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
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
    invalid(formError('areas_parentNotFound'))
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

  // `order` is 0-based, so the next slot is the count of existing (non-deleted) blocks.
  const [blocksCount] = await db
    .select({ count: count() })
    .from(blocks)
    .where(and(eq(blocks.areaFk, value.areaId), isNull(blocks.deletedAt)))

  // Optional location: a geolocation row the block points at via `geolocationFk`.
  let geolocationFk: number | undefined
  if (value.lat != null && value.long != null) {
    const [geolocation] = await db
      .insert(geolocations)
      .values({ estimated: value.estimated, lat: value.lat, long: value.long, regionFk: area.regionFk })
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
      order: blocksCount.count,
      regionFk: area.regionFk,
    })
    .returning()

  if (geolocationFk != null) {
    // Back-link the geolocation to its block (mirrors parking's areaFk link).
    await db.update(geolocations).set({ blockFk: block.id }).where(eq(geolocations.id, geolocationFk))
  }

  await refreshAreaType(db, value.areaId)

  // No name and no parent stored: a block soft-deletes, so `blocks.name` and `blocks.area_fk`
  // stay readable through the object key when the card renders.
  await insertEvent(db, {
    actorFk: user.id,
    object: { id: block.id, type: 'block' },
    regionFk: block.regionFk,
    verb: 'create',
  })

  return { redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(block.id) }) }
})

/** Edit a block's name and/or location. Reuses the create form (with `id` set). The location
 *  field is three-way: update the existing pin, attach a new one, or drop it entirely. */
export const updateBlock = authedForm(blockActionSchema, async ({ id, ...value }, { db, user, userRegions }, issue) => {
  const block = await requireRowForm(
    () => (id == null ? Promise.resolve(undefined) : db.query.blocks.findFirst({ where: eq(blocks.id, id) })),
    (row) => canEditBlock(userRegions, row),
    formError('blocks_notFound'),
  )

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

  // Sync the optional location: move the existing pin, attach a new one, or remove it. The two
  // sides of the pin are collected rather than logged here, so one submit writes one diff below.
  let geolocationFk = block.geolocationFk
  let oldLocation: null | string = null
  let newLocation: null | string = null
  if (value.lat != null && value.long != null) {
    const existing =
      geolocationFk == null
        ? null
        : await db.query.geolocations.findFirst({ where: eq(geolocations.id, geolocationFk) })

    oldLocation = existing == null ? null : stringifyCoords(existing, existing.estimated)
    newLocation = stringifyCoords({ lat: value.lat, long: value.long }, value.estimated)

    if (existing == null) {
      const [geolocation] = await db
        .insert(geolocations)
        .values({
          blockFk: block.id,
          estimated: value.estimated,
          lat: value.lat,
          long: value.long,
          regionFk: block.regionFk,
        })
        .returning()
      geolocationFk = geolocation.id
    } else {
      await db
        .update(geolocations)
        .set({ estimated: value.estimated, lat: value.lat, long: value.long })
        .where(eq(geolocations.id, existing.id))
    }
  } else if (geolocationFk != null) {
    // Read the pin before dropping it: `oldValue` is the only place the feed can learn where
    // the block used to be, since the row it points at is about to be gone.
    const removed = await db.query.geolocations.findFirst({ where: eq(geolocations.id, geolocationFk) })
    oldLocation = removed == null ? null : stringifyCoords(removed, removed.estimated)

    // Removed: break the block→geo link first so the row can be deleted.
    await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
    await db.delete(geolocations).where(eq(geolocations.id, geolocationFk))
    geolocationFk = null
  }

  await db.update(blocks).set({ geolocationFk, name: value.name }).where(eq(blocks.id, block.id))

  // One call for the whole submit, the way `updateRoute` does it: both columns land on the same
  // event anyway, and a call apiece pays for the open-event lookup and the readback twice.
  //
  // The form resubmits the current pin on every save, so a name-only edit arrives here with
  // unchanged coordinates. `createUpdateEvent` compares before it writes, so that is a no-op
  // rather than a lie in the feed, and a burst of nudges merges into one change row that keeps
  // the original `oldValue`.
  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { location: newLocation, name: value.name },
    object: { id: block.id, type: 'block' },
    oldEntity: { location: oldLocation, name: block.name },
    regionFk: block.regionFk,
  })

  return { redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(block.id) }) }
})

/** Move-on-the-map shortcut: set the block's pin straight from the picker, skipping the
 *  edit form. Upserts the geolocation (and links it on first set), then returns to the block. */
export const setBlockLocation = authedCommand(
  z.object({ id: z.number(), lat: boundedDegrees(90), long: boundedDegrees(180) }),
  async (value, { db, user, userRegions }) => {
    const block = await requireRow(
      () => db.query.blocks.findFirst({ where: eq(blocks.id, value.id) }),
      (row) => canEditBlock(userRegions, row),
      'Block not found',
    )

    const existing =
      block.geolocationFk == null
        ? null
        : await db.query.geolocations.findFirst({ where: eq(geolocations.id, block.geolocationFk) })

    if (existing == null) {
      const [geolocation] = await db
        .insert(geolocations)
        .values({ blockFk: block.id, lat: value.lat, long: value.long, regionFk: block.regionFk })
        .returning()
      await db.update(blocks).set({ geolocationFk: geolocation.id }).where(eq(blocks.id, block.id))
    } else {
      await db.update(geolocations).set({ lat: value.lat, long: value.long }).where(eq(geolocations.id, existing.id))
    }

    // The pin dragged on the map keeps whatever `estimated` flag it had: this move confirms
    // nothing, it only relocates. Clearing the flag is the edit form's job.
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { location: stringifyCoords(value, existing?.estimated) },
      object: { id: block.id, type: 'block' },
      oldEntity: { location: existing == null ? null : stringifyCoords(existing, existing.estimated) },
      regionFk: block.regionFk,
    })

    return { redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(block.id) }) }
  },
)

/** Backfill a rough pin from a topo photo's GPS EXIF when the block has none yet. Marked
 *  `estimated`, and a no-op once the block has any geolocation, so it never overrides a real
 *  pin and is safe to fire on every topo upload. */
export const estimateBlockLocationFromPhoto = authedCommand(
  z.object({
    id: z.number(),
    lat: boundedDegrees(90),
    long: boundedDegrees(180),
  }),
  async (value, { db, user, userRegions }) => {
    const block = await requireRow(
      () => db.query.blocks.findFirst({ where: eq(blocks.id, value.id) }),
      (row) => canEditBlock(userRegions, row),
      'Block not found',
    )

    if (block.geolocationFk != null) return

    const [geolocation] = await db
      .insert(geolocations)
      .values({
        blockFk: block.id,
        estimated: true,
        lat: value.lat,
        long: value.long,
        regionFk: block.regionFk,
      })
      .returning()
    await db.update(blocks).set({ geolocationFk: geolocation.id }).where(eq(blocks.id, block.id))

    // Always the first pin (the guard above returns when the block has one), so no old value.
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { location: stringifyCoords(value, true) },
      object: { id: block.id, type: 'block' },
      oldEntity: { location: null },
      regionFk: block.regionFk,
    })
  },
)

/** Snapshot {@link deleteBlock} returns so {@link restoreBlock} can undo either delete path.
 *  The hard path carries `order` so the restore can slot the block back where it was. */
type DeleteBlockSnapshot =
  | {
      areaFk: number
      block: Pick<Block, 'name' | 'order' | 'regionFk'>
      blockId: number
      geolocation: null | { estimated: boolean; lat: number; long: number }
      mode: 'hard'
    }
  // No `deletedAt`, same as the area snapshot: the soft delete's timestamp used to go out to the
  // client and come back as the only thing `softRestoreBlock` matched on. It is read off the
  // stored block now.
  | { blockId: number; mode: 'soft' }

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
    areaFk: block.areaFk,
    block: { name: block.name, order: block.order, regionFk: block.regionFk },
    blockId: block.id,
    geolocation:
      geolocation == null ? null : { estimated: geolocation.estimated, lat: geolocation.lat, long: geolocation.long },
    mode: 'hard',
  }
}

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

  return { blockId: block.id, mode: 'soft' }
}

/** Delete a block. A bare block (no routes, topos or files) is hard-deleted with a snapshot;
 *  one with descendants is soft-deleted. Either way the remaining siblings close the gap so
 *  their `order` stays contiguous. Returns the snapshot {@link restoreBlock} undoes from. */
export const deleteBlock = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteBlockSnapshot>> => {
    const block = await requireRow(
      () => db.query.blocks.findFirst({ where: eq(blocks.id, id) }),
      (row) => canDeleteBlock(userRegions, user.id, row),
      'Block not found',
    )

    // Routes/topos/files FK-reference the block; a block with any of them is soft-deleted so
    // undo restores them cleanly (and so the hard delete never hits a FK constraint).
    //
    // Two counts, because the two questions have different answers. Whether a hard delete is
    // safe is about every route that still points here, soft-deleted ones included. What the
    // card says this delete took is about the live ones, counted before the stamp lands.
    const [[routeTotal], [routeCount], topo, file] = await Promise.all([
      db.select({ value: count() }).from(routes).where(eq(routes.blockFk, id)),
      db
        .select({ value: count() })
        .from(routes)
        .where(and(eq(routes.blockFk, id), isNull(routes.deletedAt))),
      db.query.topos.findFirst({ columns: { id: true }, where: eq(topos.blockFk, id) }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.blockFk, id) }),
    ])

    // Childless is necessary but no longer sufficient: `events.block_fk` cascades, so erasing a
    // block that has been logged for a while takes its history, and one somebody has reacted to
    // takes their words.
    const erasable = await canHardDelete(db, {
      childless: routeTotal.value === 0 && topo == null && file == null,
      createdAt: block.createdAt,
      object: { id, type: 'block' },
    })

    const data = erasable ? await hardDeleteBlock(db, block) : await softDeleteBlock(db, block)

    // Close the gap the block leaves; the soft-deleted block keeps its own `order` for restore.
    await shiftBlockOrdersDown(db, block.areaFk, block.order)

    // Soft path only. `events.block_fk` is an immediate foreign key, so an event written after
    // the row is gone aborts the transaction, and one written before it is cascaded away a
    // statement later: a mistake inside the grace window leaves no trace either way.
    if (!erasable) {
      await insertEvent(db, {
        actorFk: user.id,
        // What went with it, recorded while it is still knowable: the count is gone the moment
        // the routes are stamped. The block's own name is not stored, because the soft delete
        // keeps the row readable.
        metadata: stringifyDeletionScale({ routes: routeCount.value }),
        object: { id: block.id, type: 'block' },
        regionFk: block.regionFk,
        verb: 'delete',
      })
    }
    await refreshAreaType(db, block.areaFk)

    return { data, redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(block.areaFk) }) }
  },
)

const restoreBlockSchema = z.discriminatedUnion('mode', [
  z.object({
    areaFk: z.number(),
    block: z.object({ name: z.string(), order: z.number(), regionFk: z.number() }),
    blockId: z.number(),
    // Bounded like every other coordinate this app accepts (`coordinate(90)` on the block form,
    // `estimateBlockLocationFromPhoto` on the command side). `geolocations` has no CHECK constraint,
    // so an unbounded snapshot was the one door that could park a block at lat 999.
    geolocation: z.object({ estimated: z.boolean(), lat: boundedDegrees(90), long: boundedDegrees(180) }).nullable(),
    mode: z.literal('hard'),
  }),
  // No `deletedAt` to accept: the restore reads it off the stored block.
  z.object({ blockId: z.number(), mode: z.literal('soft') }),
])

/** Recreate a hard-deleted block at its original `order`, re-linking its pin. Opens the slot
 *  first so the block lands exactly where it was. Returns the new block id. */
async function hardRestoreBlock(
  db: Context['db'],
  snapshot: Extract<DeleteBlockSnapshot, { mode: 'hard' }>,
  area: Pick<Area, 'id' | 'regionFk'>,
  createdBy: number,
): Promise<number> {
  await shiftBlockOrdersUp(db, area.id, snapshot.block.order)

  // Placement comes from the STORED area, not the client-supplied snapshot: `restoreBlock` ran
  // `canAddBlock` against that row, so `area.regionFk` is the region actually authorized.
  // `createdBy` is the caller, so an undo cannot forge authorship.
  const [created] = await db
    .insert(blocks)
    .values({
      areaFk: area.id,
      createdBy,
      name: snapshot.block.name,
      order: snapshot.block.order,
      regionFk: area.regionFk,
    })
    .returning()

  if (snapshot.geolocation != null) {
    // The three snapshot fields and nothing else. `areaFk` in particular stays unset: a geolocation
    // that carries one is a PARKING (that is how `deleteParking` tells the two apart, and removing a
    // parking takes region DELETE), and a spread is one added snapshot field away from setting it.
    const [geo] = await db
      .insert(geolocations)
      .values({
        blockFk: created.id,
        estimated: snapshot.geolocation.estimated,
        lat: snapshot.geolocation.lat,
        long: snapshot.geolocation.long,
        regionFk: area.regionFk,
      })
      .returning()
    await db.update(blocks).set({ geolocationFk: geo.id }).where(eq(blocks.id, created.id))
  }

  return created.id
}

/** Un-soft-delete a block and its routes, slotting it back at the `order` it kept. Opens the
 *  slot among the visible siblings first (the block itself is still `deletedAt` at that point).
 *
 *  Both statements name the block, and the timestamp comes off the stored row rather than off the
 *  client. They used to match on `deletedAt = <client-supplied timestamp>` alone: `deleted_at` is
 *  not unique and carries no region, so an undo here revived every other region's block stamped in
 *  the same millisecond, and the routes statement did not mention the block at all, so it could
 *  bring routes back under a block that stayed deleted.
 *
 *  A block that is not deleted returns before the order shift, which would otherwise renumber live
 *  siblings around a block that never left. */
async function softRestoreBlock(db: Context['db'], block: Block): Promise<void> {
  if (block.deletedAt == null) {
    return
  }

  await shiftBlockOrdersUp(db, block.areaFk, block.order)
  await db
    .update(blocks)
    .set({ deletedAt: null })
    .where(and(eq(blocks.id, block.id), eq(blocks.deletedAt, block.deletedAt)))
  await db
    .update(routes)
    .set({ deletedAt: null })
    .where(and(eq(routes.blockFk, block.id), eq(routes.deletedAt, block.deletedAt)))
}

/** Undo a {@link deleteBlock}: recreate the hard-deleted block (with its pin) or clear the
 *  `deletedAt` the soft delete stamped — either way slotting it back at its original order, and
 *  erasing the delete event so the timeline reads as if it never happened. */
export const restoreBlock = authedCommand(restoreBlockSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    // The snapshot is client-supplied, so re-validate placement the way createBlock does: the target
    // area must exist and be in the region the caller claims - otherwise a block could be restored
    // into another region's area (and shiftBlockOrdersUp would renumber that area's order).
    const area = await db.query.areas.findFirst({ where: eq(areas.id, snapshot.areaFk) })

    if (area == null) {
      error(404, formError('areas_parentNotFound'))
    }
    if (area.regionFk !== snapshot.block.regionFk) {
      error(403, formError('form_noPermission'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one. Gating on
    // canDeleteBlock instead would deny the undo to the EDITor who just deleted their own block:
    // the snapshot carries no `createdBy`, so that predicate's own-created branch can never fire.
    if (!canAddBlock(userRegions, area)) {
      error(403, formError('form_noPermission'))
    }

    // The area row, not the snapshot's id: everything after the gate reads the row the gate read.
    const blockId = await hardRestoreBlock(db, snapshot, area, user.id)

    // The stored area's id, not `snapshot.areaFk`: the gate above authorized that row, so it is the
    // one everything after it reads.
    await refreshAreaType(db, area.id)
    // Nothing to move onto the new id: only a block inside the grace window is hard-deleted, and
    // `events.block_fk on delete cascade` took its entire log with it.

    return {
      data: { blockId },
      redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(blockId) }),
    }
  }

  const block = await db.query.blocks.findFirst({ where: eq(blocks.id, snapshot.blockId) })

  if (block == null || !canDeleteBlock(userRegions, user.id, block)) {
    error(403, formError('form_noPermission'))
  }

  // Nothing to undo. A replayed Undo or a stale snapshot arrives here on a live block, and the rest
  // of this handler would erase a `deleted` card for something standing right there, while
  // `shiftBlockOrdersUp` inside the restore renumbers siblings for a block that never left.
  if (block.deletedAt == null) {
    return {
      data: { blockId: snapshot.blockId },
      redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(snapshot.blockId) }),
    }
  }

  // The stored block, not the snapshot: `canDeleteBlock` above authorized THIS row.
  await softRestoreBlock(db, block)

  await refreshAreaType(db, block.areaFk)
  // The delete event and nothing else: the block's own create and every edit ever made to it
  // still point at this id and stay live.
  await deleteEvent(db, { object: { id: snapshot.blockId, type: 'block' }, verb: 'delete' })

  return {
    data: { blockId: snapshot.blockId },
    redirectTo: resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(snapshot.blockId) }),
  }
})

/** Persist a new block order for an area — `orderedIds` is the full sequence of its (visible)
 *  blocks, top to bottom. Used by the reorder page (drag + "sort by distance"). Foreign/stale
 *  ids are ignored so a client can't renumber blocks outside the area. */
export const reorderBlocks = authedCommand(
  z.object({ areaId: z.number(), orderedIds: z.array(z.number()) }),
  async ({ areaId, orderedIds }, { db, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (area == null) {
      error(404, 'Area not found')
    }

    if (!canEditBlock(userRegions, area)) {
      error(403, formError('form_noPermission'))
    }

    const areaBlocks = await db.query.blocks.findMany({
      columns: { id: true },
      where: and(eq(blocks.areaFk, areaId), isNull(blocks.deletedAt)),
    })
    const belongsToArea = new Set(areaBlocks.map((row) => row.id))

    // `order` is 0-based and not uniquely constrained, so each block can be set to its slot
    // directly. ponytail: one UPDATE per block — fine for the handful of blocks an area has; a
    // single CASE update is the upgrade if an area ever holds hundreds.
    let order = 0
    for (const id of orderedIds) {
      if (!belongsToArea.has(id)) continue
      await db.update(blocks).set({ order }).where(eq(blocks.id, id))
      order += 1
    }

    return { redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(areaId) }) }
  },
)
