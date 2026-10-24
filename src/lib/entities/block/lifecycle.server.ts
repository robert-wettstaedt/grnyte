import { areas, blocks, files, geolocations, routes, topos, type Area, type Block } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import type { RemovalInput } from '$lib/entities/moderation/dto'
import type { Planned } from '$lib/entities/moderation/record.server'
import { planRemoval } from '$lib/entities/moderation/subjects.server'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { answerReplayedRestore, requireIssuedId, requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, count, eq, gt, gte, isNull, ne, sql } from 'drizzle-orm'
import { hasDeletedAncestor, refreshAreaType, stampDeletedAt } from '../area/area.server'
import { canAddBlock } from '../area/permissions'
import { canHardDelete, deleteEvent, insertEvent } from '../event/event.server'
import { stringifyDeletionScale } from '../event/metadata'
import { restoreBlockSchema, type DeleteBlockSnapshot } from './dto'
import { canDeleteBlock } from './permissions'
import { attachPin, removePin } from './pin.server'

type Caller = Pick<Context, 'db' | 'user' | 'userRegions'>

/** Delete a block. A bare block (no routes, topos or files) is hard-deleted with a snapshot; one
 *  with descendants is soft-deleted. Either way the remaining siblings close the gap so their
 *  `order` stays contiguous. Answers the snapshot {@link restoreBlockRow} undoes from. */
export async function deleteBlockRow(
  { id, removal }: { id: number; removal?: RemovalInput },
  { db, user, userRegions }: Caller,
): Promise<Planned<DeleteBlockSnapshot>> {
  const block = await requireRow(
    () => db.query.blocks.findFirst({ where: and(eq(blocks.id, id), isNull(blocks.deletedAt)) }),
    (row) => canDeleteBlock(userRegions, user.id, row),
    formError('blocks_notFound'),
  )

  // Collected before anything is stamped, from the rows this delete is about to take.
  const planned = await planRemoval(db, { id, kind: 'block', regionFk: block.regionFk }, removal, { user, userRegions })

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
  // A removal is always soft, so a reversal on appeal has a row to bring back.
  const erasable =
    planned == null &&
    (await canHardDelete(db, {
      childless: routeTotal.value === 0 && topo == null && file == null,
      createdAt: block.createdAt,
      object: { id, type: 'block' },
    }))

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

  return { data, redirectTo: entityHref('areas', block.areaFk), removal: planned }
}

/** Hard-delete a bare block: drop its pin (FK-linked both ways) then the row. Returns the
 *  snapshot (including `order`) that `restoreBlock` recreates it from. */
export async function hardDeleteBlock(db: Context['db'], block: Block): Promise<DeleteBlockSnapshot> {
  const geolocation =
    block.geolocationFk == null
      ? null
      : await db.query.geolocations.findFirst({ where: eq(geolocations.id, block.geolocationFk) })

  if (block.geolocationFk != null) {
    await removePin(db, { geolocationFk: block.geolocationFk, id: block.id })
  }
  await db.delete(blocks).where(eq(blocks.id, block.id))

  return {
    areaFk: block.areaFk,
    block: { description: block.description, name: block.name, order: block.order, regionFk: block.regionFk },
    blockId: block.id,
    geolocation:
      geolocation == null ? null : { estimated: geolocation.estimated, lat: geolocation.lat, long: geolocation.long },
    mode: 'hard',
  }
}

/** Recreate a hard-deleted block under its original id, `order` and pin. A replayed Undo finds
 *  the id taken and changes nothing, sibling order included. */
export async function hardRestoreBlock(
  db: Context['db'],
  snapshot: Extract<z.infer<typeof restoreBlockSchema>, { mode: 'hard' }>,
  area: Pick<Area, 'id' | 'regionFk'>,
  createdBy: number,
): Promise<Block | undefined> {
  // Placement comes from the STORED area, not the client-supplied snapshot: `restoreBlock` ran
  // `canAddBlock` against that row, so `area.regionFk` is the region authorized.
  // `createdBy` is the caller, so an undo cannot forge authorship.
  const [created] = await db
    .insert(blocks)
    .values({
      areaFk: area.id,
      createdBy,
      description: snapshot.block.description,
      id: snapshot.blockId,
      name: snapshot.block.name,
      order: snapshot.block.order,
      regionFk: area.regionFk,
    })
    .onConflictDoNothing({ target: blocks.id })
    .returning()
  if (created == null) {
    return undefined
  }
  await shiftBlockOrdersUp(db, area.id, snapshot.block.order, created.id)

  if (snapshot.geolocation != null) {
    // Named fields only, never a spread: `attachPin` never sets `areaFk`, which would make it a parking.
    const { estimated, lat, long } = snapshot.geolocation
    await attachPin(db, { id: created.id, regionFk: area.regionFk }, { estimated, lat, long })
  }

  return created
}

/** Undo a {@link deleteBlockRow}: recreate the hard-deleted block (with its pin) or clear the
 *  soft delete's `deletedAt`, slotting it back at its order and erasing the delete event. */
export async function restoreBlockRow(
  snapshot: z.infer<typeof restoreBlockSchema>,
  { db, user, userRegions }: Caller,
): Promise<MutationResult<{ blockId: number }>> {
  if (snapshot.mode === 'hard') {
    // The snapshot is client-supplied, so re-validate placement the way createBlock does: the target
    // area must exist and be in the region the caller claims: otherwise a block could be restored
    // into another region's area (and shiftBlockOrdersUp would renumber that area's order).
    const area = await db.query.areas.findFirst({ where: eq(areas.id, snapshot.areaFk) })

    if (area == null) {
      error(404, formError('areas_parentNotFound'))
    }
    if (area.regionFk !== snapshot.block.regionFk) {
      error(403, formError('form_noPermission'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one. Gating on
    // canDeleteBlock instead would deny the undo to the EDITor who has now deleted their own block:
    // the snapshot carries no `createdBy`, so that predicate's own-created branch can never fire.
    if (!canAddBlock(userRegions, area)) {
      error(403, formError('form_noPermission'))
    }
    // A hard restore is a create, and a create under a dead parent strands the row.
    if (area.deletedAt != null) {
      error(404, formError('areas_parentNotFound'))
    }

    const blockId = snapshot.blockId
    await requireIssuedId(db, 'blocks', blockId, formError('blocks_notFound'))
    if ((await hardRestoreBlock(db, snapshot, area, user.id)) == null) {
      const replayed = eq(blocks.areaFk, area.id)
      return {
        data: { blockId },
        ...(await answerReplayedRestore(db, 'blocks', blockId, replayed, formError('blocks_notFound'))),
      }
    }

    // The stored area's id, not `snapshot.areaFk`: the gate above authorized that row, so it is the
    // one everything after it reads.
    await refreshAreaType(db, area.id)
    // Nothing to move onto the new id: only a block inside the grace window is hard-deleted, and
    // `events.block_fk on delete cascade` took its entire log with it.

    return {
      data: { blockId },
      redirectTo: entityHref('blocks', blockId),
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
      redirectTo: entityHref('blocks', snapshot.blockId),
    }
  }

  // Refuse rather than strand it: restore the ancestor first, which brings this row with it.
  if (await hasDeletedAncestor(db, block.areaFk)) {
    error(404, formError('areas_parentNotFound'))
  }

  // The stored block, not the snapshot: `canDeleteBlock` above authorized THIS row.
  await softRestoreBlock(db, block)

  await refreshAreaType(db, block.areaFk)
  // The delete event and nothing else: the block's own create and every edit ever made to it
  // still point at this id and stay live.
  await deleteEvent(db, { object: { id: snapshot.blockId, type: 'block' }, verb: 'delete' })

  return {
    data: { blockId: snapshot.blockId },
    redirectTo: entityHref('blocks', snapshot.blockId),
  }
}

/** Close the gap a removed block leaves: pull every later sibling in the area down one, so the
 *  visible blocks stay contiguously ordered (keeping "Block N" labels sensible). */
export async function shiftBlockOrdersDown(db: Context['db'], areaFk: number, fromOrder: number): Promise<void> {
  await db
    .update(blocks)
    .set({ order: sql`${blocks.order} - 1` })
    .where(and(eq(blocks.areaFk, areaFk), isNull(blocks.deletedAt), gt(blocks.order, fromOrder)))
}

/** Open a slot at `fromOrder` for a block being restored: push every sibling at or after it up
 *  one, so the restored block lands at exactly its original order. */
export async function shiftBlockOrdersUp(
  db: Context['db'],
  areaFk: number,
  fromOrder: number,
  exceptId?: number,
): Promise<void> {
  await db
    .update(blocks)
    .set({ order: sql`${blocks.order} + 1` })
    .where(
      and(
        eq(blocks.areaFk, areaFk),
        isNull(blocks.deletedAt),
        gte(blocks.order, fromOrder),
        exceptId == null ? undefined : ne(blocks.id, exceptId),
      ),
    )
}

/** Soft-delete a block with descendants: stamp one `deletedAt` on it and its routes (the shared
 *  restore key). The block keeps its `order`, so a restore can slot it back exactly.
 *  ponytail: timestamp as restore key; sub-ms collision with a concurrent delete is the
 *  ceiling. Upgrade = a dedicated deletion-batch id column. */
export async function softDeleteBlock(db: Context['db'], block: Block): Promise<DeleteBlockSnapshot> {
  await stampDeletedAt(db, { blockIds: [block.id] }, new Date(), null)

  return { blockId: block.id, mode: 'soft' }
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
export async function softRestoreBlock(db: Context['db'], block: Block): Promise<void> {
  if (block.deletedAt == null) {
    return
  }

  await shiftBlockOrdersUp(db, block.areaFk, block.order)
  await stampDeletedAt(db, { blockIds: [block.id] }, null, block.deletedAt)
}
