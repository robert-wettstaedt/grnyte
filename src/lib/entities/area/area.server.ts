import * as schema from '$lib/db/schema'
import { areas, blocks, routes } from '$lib/db/schema'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/** Wider than `Context['db']`: takes the RLS transaction and the plain handle both. */
type Db = PostgresJsDatabase<typeof schema>

/** The area chain root to leaf, behind the denormalized `areaFks`/`areaIds`. `includes` stops on a
 *  cycle; `parent_fk` is a self-reference and nothing forbids one. */
export async function areaAncestry(db: Db, areaId: number): Promise<number[]> {
  const chain: number[] = []
  let current: null | number = areaId
  while (current != null && !chain.includes(current)) {
    chain.unshift(current)
    const area: undefined | { parentFk: null | number } = await db.query.areas.findFirst({
      columns: { parentFk: true },
      where: eq(areas.id, current),
    })
    current = area?.parentFk ?? null
  }
  return chain
}

/** `routes.areaIds`, the text form `routes/queries.ts` matches with `%^id$%`. */
export function areaIdsOf(areaFks: readonly number[]): string {
  return areaFks.map((id) => `^${id}$`).join(',')
}

/** {@link hasDeletedAncestor} for a row hanging off a BLOCK, which has to be live itself too. */
export async function blockIsStranded(db: Db, blockId: number): Promise<boolean> {
  const block = await db.query.blocks.findFirst({
    columns: { areaFk: true, deletedAt: true },
    where: eq(blocks.id, blockId),
  })

  if (block == null || block.deletedAt != null) {
    return true
  }

  return hasDeletedAncestor(db, block.areaFk)
}

/** Whether a row under `areaId` would be stranded: an ancestor deleted, absent, or looping.
 *  All three fail closed. `areaAncestry` records an id before looking it up, so an absent row
 *  shortens the count; a root still carrying a `parentFk` means the walk stopped on a cycle. */
export async function hasDeletedAncestor(db: Db, areaId: number): Promise<boolean> {
  const chain = await areaAncestry(db, areaId)
  const rows = await db
    .select({ deletedAt: areas.deletedAt, id: areas.id, parentFk: areas.parentFk })
    .from(areas)
    .where(inArray(areas.id, chain))

  if (rows.length !== chain.length || rows.some((row) => row.deletedAt != null)) {
    return true
  }

  return rows.find((row) => row.id === chain[0])?.parentFk != null
}

/** Re-derive an area's `type` from its live (non-deleted) children, mirroring the create side
 *  where the first block makes it a `sector` and the first sub-area an `area`. Call after a block
 *  or sub-area is deleted (resets an emptied area to `null`) or restored (sets it back).
 *  ponytail: blocks win when an area has both kinds of child; areas don't mix them in practice. */
export async function refreshAreaType(db: Db, areaId: number): Promise<void> {
  const [[blockRow], [subAreaRow]] = await Promise.all([
    db
      .select({ count: count() })
      .from(blocks)
      .where(and(eq(blocks.areaFk, areaId), isNull(blocks.deletedAt))),
    db
      .select({ count: count() })
      .from(areas)
      .where(and(eq(areas.parentFk, areaId), isNull(areas.deletedAt))),
  ])

  const type = blockRow.count > 0 ? 'sector' : subAreaRow.count > 0 ? 'area' : null
  await db.update(areas).set({ type }).where(eq(areas.id, areaId))
}

/**
 * Set `deletedAt` to `to` on these areas, then these blocks, then the routes on those blocks or
 * named by id, touching only rows still carrying `from` (null: live). So a restore passes the
 * delete's stamp and never revives a child that was deleted on its own.
 */
export async function stampDeletedAt(
  db: Db,
  { areaIds = [], blockIds = [], routeIds = [] }: { areaIds?: number[]; blockIds?: number[]; routeIds?: number[] },
  to: Date | null,
  from: Date | null,
): Promise<void> {
  const carrying = (column: typeof areas.deletedAt | typeof blocks.deletedAt | typeof routes.deletedAt) =>
    from == null ? isNull(column) : eq(column, from)

  if (areaIds.length > 0) {
    await db
      .update(areas)
      .set({ deletedAt: to })
      .where(and(inArray(areas.id, areaIds), carrying(areas.deletedAt)))
  }
  if (blockIds.length > 0) {
    await db
      .update(blocks)
      .set({ deletedAt: to })
      .where(and(inArray(blocks.id, blockIds), carrying(blocks.deletedAt)))
    await db
      .update(routes)
      .set({ deletedAt: to })
      .where(and(inArray(routes.blockFk, blockIds), carrying(routes.deletedAt)))
  }
  if (routeIds.length > 0) {
    await db
      .update(routes)
      .set({ deletedAt: to })
      .where(and(inArray(routes.id, routeIds), carrying(routes.deletedAt)))
  }
}
