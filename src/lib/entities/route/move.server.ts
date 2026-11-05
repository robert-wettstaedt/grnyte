import { blocks, routes, topoRoutes, topos } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { blockIsStranded, chainRoutes } from '../area/area.server'
import { createUpdateEvent } from '../event/event.server'
import { storedName } from '../event/storedName'
import type { moveRoutesSchema } from './dto'
import { canAddRoute, canEditRoute } from './permissions'

/** Topo lines these routes would leave behind: drawn on a topo of any block but `blockId`. */
export const linesOffBlock = (db: Pick<Context['db'], 'select'>, routeIds: number[], blockId: number) =>
  and(
    inArray(topoRoutes.routeFk, routeIds),
    inArray(
      topoRoutes.topoFk,
      db
        .select({ id: topos.id })
        .from(topos)
        .where(sql`${topos.blockFk} is distinct from ${blockId}`),
    ),
  )

export async function moveRoutesRow(
  { blockId, knownTopoLines, routeIds }: z.output<typeof moveRoutesSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<{ previous: { blockId: number; id: number }[] }> {
  const destination = await requireRow(
    () => db.query.blocks.findFirst({ where: and(eq(blocks.id, blockId), isNull(blocks.deletedAt)) }),
    (row) => canAddRoute(userRegions, row),
    formError('blocks_notFound'),
  )
  if (await blockIsStranded(db, destination.id)) {
    error(404, formError('blocks_notFound'))
  }

  const moving = []
  for (const id of new Set(routeIds)) {
    const row = await requireRow(
      () => db.query.routes.findFirst({ where: and(eq(routes.id, id), isNull(routes.deletedAt)) }),
      (route) => canEditRoute(userRegions, route) && route.regionFk === destination.regionFk,
      formError('routes_notFound'),
    )
    if (row.blockFk !== destination.id) moving.push(row)
  }
  if (moving.length === 0) return { previous: [] }

  const ids = moving.map((row) => row.id)
  const offBlock = linesOffBlock(db, ids, destination.id)
  const [{ lines }] = await db.select({ lines: count() }).from(topoRoutes).where(offBlock)
  if (lines !== knownTopoLines) {
    error(409, formError('routes_moveTopoLinesChanged'))
  }
  await db.delete(topoRoutes).where(offBlock)

  await db.update(routes).set({ blockFk: destination.id }).where(inArray(routes.id, ids))
  await chainRoutes(db, destination.areaFk, inArray(routes.id, ids))

  const sources = await db.query.blocks.findMany({
    where: inArray(blocks.id, [...new Set(moving.map((row) => row.blockFk))]),
  })
  const nameOf = (block: { name: string; order: number }) => storedName(block.name, block.order)
  for (const row of moving) {
    const source = sources.find((block) => block.id === row.blockFk)
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { parent: nameOf(destination) },
      object: { id: row.id, type: 'route' },
      oldEntity: { parent: source == null ? null : nameOf(source) },
      regionFk: row.regionFk,
    })
  }

  return { previous: moving.map((row) => ({ blockId: row.blockFk, id: row.id })) }
}
