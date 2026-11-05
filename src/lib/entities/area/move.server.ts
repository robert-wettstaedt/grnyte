import { areas, regions } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createUpdateEvent } from '../event/event.server'
import { storedName } from '../event/storedName'
import { areaAncestry, hasDeletedAncestor, recomputeAreaChains, refreshAreaType } from './area.server'
import type { moveAreasSchema } from './dto'
import { canAddArea, canEditArea } from './permissions'

/** `parentId` null is the top level; each moved area answers its old parent for the Undo. */
export async function moveAreasRow(
  { areaIds, parentId }: z.output<typeof moveAreasSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<{ previous: { id: number; parentId: null | number }[] }> {
  const parent =
    parentId == null
      ? null
      : await requireRow(
          () => db.query.areas.findFirst({ where: and(eq(areas.id, parentId), isNull(areas.deletedAt)) }),
          (row) => canAddArea(userRegions, row),
          formError('areas_notFound'),
        )
  if (parent != null && (await hasDeletedAncestor(db, parent.id))) {
    error(404, formError('areas_notFound'))
  }
  const above = parent == null ? [] : await areaAncestry(db, parent.id)

  const moving = []
  for (const id of new Set(areaIds)) {
    const row = await requireRow(
      () => db.query.areas.findFirst({ where: and(eq(areas.id, id), isNull(areas.deletedAt)) }),
      (area) => canEditArea(userRegions, area) && (parent == null || area.regionFk === parent.regionFk),
      formError('areas_notFound'),
    )
    if (above.includes(row.id)) {
      error(400, formError('areas_moveIntoItself'))
    }
    if (row.parentFk !== (parent?.id ?? null)) moving.push(row)
  }
  if (moving.length === 0) return { previous: [] }

  const ids = moving.map((row) => row.id)
  await db
    .update(areas)
    .set({ parentFk: parent?.id ?? null })
    .where(inArray(areas.id, ids))

  const oldParents = [...new Set(moving.map((row) => row.parentFk).filter((id) => id != null))]
  for (const id of [...oldParents, ...(parent == null ? [] : [parent.id])]) await refreshAreaType(db, id)
  await recomputeAreaChains(db, ids)

  // The top level has no parent row, so a move there names the region instead.
  const names = new Map(
    (await db.query.areas.findMany({ where: inArray(areas.id, oldParents) })).map((row) => [row.id, row.name]),
  )
  const regionNames = new Map<number, null | string>()
  const regionName = async (regionFk: number) => {
    if (!regionNames.has(regionFk)) {
      const region = await db.query.regions.findFirst({ columns: { name: true }, where: eq(regions.id, regionFk) })
      regionNames.set(regionFk, region?.name ?? null)
    }
    return regionNames.get(regionFk)!
  }
  for (const row of moving) {
    const before = row.parentFk == null ? await regionName(row.regionFk) : names.get(row.parentFk)
    const after = parent == null ? await regionName(row.regionFk) : parent.name
    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { parent: storedName(after) },
      object: { id: row.id, type: 'area' },
      oldEntity: { parent: storedName(before ?? null) },
      regionFk: row.regionFk,
    })
  }

  return { previous: moving.map((row) => ({ id: row.id, parentId: row.parentFk })) }
}
