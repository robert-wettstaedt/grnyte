import { areas, blocks, routes } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { chainRoutes, hasDeletedAncestor, refreshAreaType } from '../area/area.server'
import { canAddBlock } from '../area/permissions'
import { createUpdateEvent } from '../event/event.server'
import { storedName } from '../event/storedName'
import type { moveBlocksSchema } from './dto'
import { liveIdsIn, renumberArea } from './order.server'
import { canEditBlock } from './permissions'

type Caller = Pick<Context, 'db' | 'user' | 'userRegions'>

/** Each source area's slot order before the move, which `restoreOrder` hands back on Undo. */
export async function moveBlocksRow(
  { areaId, blockIds, restoreOrder }: z.output<typeof moveBlocksSchema>,
  { db, user, userRegions }: Caller,
): Promise<{ previous: { areaId: number; order: number[] }[] }> {
  const destination = await requireRow(
    () => db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) }),
    (row) => canAddBlock(userRegions, row),
    formError('areas_notFound'),
  )
  if (await hasDeletedAncestor(db, destination.id)) {
    error(404, formError('areas_notFound'))
  }

  const moving = []
  for (const id of new Set(blockIds)) {
    const row = await requireRow(
      () => db.query.blocks.findFirst({ where: and(eq(blocks.id, id), isNull(blocks.deletedAt)) }),
      (block) => canEditBlock(userRegions, block) && block.regionFk === destination.regionFk,
      formError('blocks_notFound'),
    )
    if (row.areaFk !== destination.id) moving.push(row)
  }
  if (moving.length === 0) return { previous: [] }

  const sourceIds = [...new Set(moving.map((row) => row.areaFk))]
  const previous = []
  for (const sourceId of sourceIds) previous.push({ areaId: sourceId, order: await liveIdsIn(db, sourceId) })

  const ids = moving.map((row) => row.id)
  const staying = (await liveIdsIn(db, destination.id)).filter((id) => !ids.includes(id))
  await db.update(blocks).set({ areaFk: destination.id }).where(inArray(blocks.id, ids))

  // An Undo slots the blocks back where they were; anything added there since keeps its place after them.
  const target = restoreOrder == null ? [...staying, ...ids] : [...restoreOrder, ...staying, ...ids]
  await renumberArea(
    db,
    [...new Set(target)].filter((id) => staying.includes(id) || ids.includes(id)),
  )
  for (const sourceId of sourceIds) {
    await renumberArea(db, await liveIdsIn(db, sourceId))
    await refreshAreaType(db, sourceId)
  }
  await refreshAreaType(db, destination.id)
  await chainRoutes(db, destination.id, inArray(routes.blockFk, ids))

  const sources = await db.query.areas.findMany({ where: inArray(areas.id, sourceIds) })
  for (const row of moving) {
    const source = sources.find((area) => area.id === row.areaFk)
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { parent: storedName(destination.name) },
      object: { id: row.id, type: 'block' },
      oldEntity: { parent: source == null ? null : storedName(source.name) },
      regionFk: row.regionFk,
    })
  }

  return { previous }
}
