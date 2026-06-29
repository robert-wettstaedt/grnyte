import { areas, blocks } from '$lib/db/schema'
import type { Context } from '$lib/remote/authed.server'
import { and, count, eq, isNull } from 'drizzle-orm'

/** Re-derive an area's `type` from its live (non-deleted) children, mirroring the create side
 *  where the first block makes it a `crag` and the first sub-area an `area`. Call after a block
 *  or sub-area is deleted (resets an emptied area to `null`) or restored (sets it back).
 *  ponytail: blocks win when an area has both kinds of child — areas don't mix them in practice. */
export async function refreshAreaType(db: Context['db'], areaId: number): Promise<void> {
  const [[blockRow], [subAreaRow]] = await Promise.all([
    db.select({ count: count() }).from(blocks).where(and(eq(blocks.areaFk, areaId), isNull(blocks.deletedAt))),
    db.select({ count: count() }).from(areas).where(and(eq(areas.parentFk, areaId), isNull(areas.deletedAt))),
  ])

  const type = blockRow.count > 0 ? 'crag' : subAreaRow.count > 0 ? 'area' : null
  await db.update(areas).set({ type }).where(eq(areas.id, areaId))
}
