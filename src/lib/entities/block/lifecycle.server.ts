import { blocks, geolocations, type Area, type Block } from '$lib/db/schema'
import { boundedDegrees } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { type Context } from '$lib/remote/authed.server'
import { and, eq, gt, gte, isNull, ne, sql } from 'drizzle-orm'
import { stampDeletedAt } from '../area/area.server'
import { attachPin, removePin } from './pin.server'

/** Snapshot `deleteBlock` returns so `restoreBlock` can undo either delete path.
 *  The hard path carries `order` so the restore can slot the block back where it was. */
export type DeleteBlockSnapshot =
  | {
      areaFk: number
      block: Pick<Block, 'description' | 'name' | 'order' | 'regionFk'>
      blockId: number
      geolocation: null | { estimated: boolean; lat: number; long: number }
      mode: 'hard'
    }
  // No `deletedAt`: read off the stored block rather than accepted from the client (see `softRestoreBlock`).
  | { blockId: number; mode: 'soft' }

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

export const restoreBlockSchema = z.discriminatedUnion('mode', [
  z.object({
    areaFk: z.number(),
    block: z.object({
      description: z.nullable(z.string()),
      name: z.string(),
      order: z.number(),
      regionFk: z.number(),
    }),
    blockId: z.number(),
    // Bounded like every other coordinate this app accepts (`coordinate(90)` on the block form,
    // `estimateBlockLocationFromPhoto` on the command side). `geolocations` has no CHECK constraint,
    // so an unbounded snapshot was the one door that could park a block at lat 999.
    geolocation: z.nullable(z.object({ estimated: z.boolean(), lat: boundedDegrees(90), long: boundedDegrees(180) })),
    mode: z.literal('hard'),
  }),
  // No `deletedAt` to accept: the restore reads it off the stored block.
  z.object({ blockId: z.number(), mode: z.literal('soft') }),
])

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
