import { areas, blocks } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm'
import type { reorderBlocksSchema } from './dto'
import { canEditBlock } from './permissions'

/**
 * The server half of the block ordering rule; `order.ts` says why the tie-break is `id`.
 *
 * Deliberately NOT named `inAreaOrder` to match its twin: nothing stops a `.svelte` file importing
 * this (no lint rule covers a `.server.ts` suffix), and two exports under one name would put
 * drizzle in the client bundle on one wrong autocomplete.
 */
export function inAreaOrderSql(table: Pick<typeof blocks, 'id' | 'order'>): SQL[] {
  return [asc(table.order), asc(table.id)]
}

/** Persist a new block order for an area. `orderedIds` is what the client could see, top to
 *  bottom, and deliberately not all of them: submitted ids take the slots those blocks already
 *  held, everything absent keeps its own. Foreign and stale ids are dropped. */
export async function reorderBlocksRow(
  { areaId, orderedIds }: z.output<typeof reorderBlocksSchema>,
  { db, userRegions }: Pick<Context, 'db' | 'userRegions'>,
) {
  await requireRow(
    () => db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) }),
    (row) => canEditBlock(userRegions, row),
    formError('areas_notFound'),
  )

  const areaBlocks = await db.query.blocks.findMany({
    columns: { id: true },
    // The same rule the client reads blocks by (`./order`), so the slots match what was seen.
    orderBy: inAreaOrderSql,
    where: and(eq(blocks.areaFk, areaId), isNull(blocks.deletedAt)),
  })
  const belongsToArea = new Set(areaBlocks.map((row) => row.id))

  // The whole area, not only what was sent: numbering just those left duplicates behind, and
  // putting them in front reordered blocks the reader never saw.
  const queue = [...new Set(orderedIds)].filter((id) => belongsToArea.has(id))
  const submitted = new Set(queue)
  const renumbered = areaBlocks.map((row) => (submitted.has(row.id) ? queue.shift()! : row.id))

  // One UPDATE per block, fine at this size; a single CASE update is the upgrade for hundreds.
  let order = 0
  for (const id of renumbered) {
    await db.update(blocks).set({ order }).where(eq(blocks.id, id))
    order += 1
  }

  return { redirectTo: entityHref('areas', areaId) }
}
