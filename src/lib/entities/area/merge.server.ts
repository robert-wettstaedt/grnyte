import { areas, blocks, geolocations, type Area } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, count, eq, isNull, ne } from 'drizzle-orm'
import { liveIdsIn, renumberArea } from '../block/order.server'
import { createUpdateEvent } from '../event/event.server'
import { storedName } from '../event/storedName'
import { before, resolved } from '../merge/fields'
import { lockPair, repoint, repointLevel } from '../merge/repoint.server'
import { areaAncestry, recomputeAreaChains, refreshAreaType, stampDeletedAt } from './area.server'
import { mergeAreasSchema } from './dto'
import { canDeleteArea, canEditArea } from './permissions'

// Every field the person may choose, so a new one cannot be dropped here unnoticed.
const AREA_MERGE_FIELDS = Object.keys(mergeAreasSchema.shape.values.shape) as (keyof z.output<
  typeof mergeAreasSchema
>['values'])[]

type Plan = { source: Area; survivor: Area }

/** The caller's half: gates, the tree rules, the survivor's fields, the source's children, the retirement. */
export async function planAreaMerge(
  { sourceId, survivorId, values }: z.output<typeof mergeAreasSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<Plan> {
  const live = (id: number) => () => db.query.areas.findFirst({ where: and(eq(areas.id, id), isNull(areas.deletedAt)) })
  const source = await requireRow(
    live(sourceId),
    (row) => canDeleteArea(userRegions, user.id, row),
    formError('areas_notFound'),
  )
  const survivor = await requireRow(
    live(survivorId),
    (row) => canEditArea(userRegions, row) && row.regionFk === source.regionFk && row.id !== source.id,
    formError('areas_notFound'),
  )
  if (!(await lockPair(db, 'areas', source.id, survivor.id))) {
    error(409, formError('areas_notFound'))
  }
  if ((await areaAncestry(db, survivor.id)).includes(source.id)) {
    error(400, formError('areas_mergeIntoOwnArea'))
  }
  // The source itself is about to leave, so it never counts as one of the survivor's children.
  const holds = async (areaId: number) => {
    const [[block], [sub]] = await Promise.all([
      db
        .select({ n: count() })
        .from(blocks)
        .where(and(eq(blocks.areaFk, areaId), isNull(blocks.deletedAt))),
      db
        .select({ n: count() })
        .from(areas)
        .where(and(eq(areas.parentFk, areaId), ne(areas.id, source.id), isNull(areas.deletedAt))),
    ])
    return { blocks: block.n > 0, subAreas: sub.n > 0 }
  }
  const [from, into] = [await holds(source.id), await holds(survivor.id)]
  if ((from.blocks && into.subAreas) || (from.subAreas && into.blocks)) {
    error(400, formError('areas_mergeMixedChildren'))
  }

  const patch = resolved(survivor, source, AREA_MERGE_FIELDS, values) as Partial<Area>
  if (Object.keys(patch).length > 0)
    await db
      .update(areas)
      .set({ description: patch.description, name: patch.name } satisfies Record<keyof typeof values, unknown>)
      .where(eq(areas.id, survivor.id))

  // Children, deleted ones too, so a later restore lands them under the survivor; blocks keep their order after its own.
  const order = [...(await liveIdsIn(db, survivor.id)), ...(await liveIdsIn(db, source.id))]
  await db.update(areas).set({ parentFk: survivor.id }).where(eq(areas.parentFk, source.id))
  await db.update(blocks).set({ areaFk: survivor.id }).where(eq(blocks.areaFk, source.id))
  await renumberArea(db, order)
  await refreshAreaType(db, survivor.id)
  const type = (await db.query.areas.findFirst({ columns: { type: true }, where: eq(areas.id, survivor.id) }))?.type
  // Parking belongs to a sector; anywhere else it stays behind with the retired source.
  if (type === 'sector') {
    await db.update(geolocations).set({ areaFk: survivor.id }).where(eq(geolocations.areaFk, source.id))
  }
  await recomputeAreaChains(db, [survivor.id])

  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { mergedFrom: storedName(source.name), ...patch },
    object: { id: survivor.id, type: 'area' },
    oldEntity: { mergedFrom: null, ...before(survivor, patch) },
    regionFk: survivor.regionFk,
  })
  await stampDeletedAt(db, { areaIds: [source.id] }, new Date(), null)
  await db.update(areas).set({ mergedInto: survivor.id }).where(eq(areas.id, source.id))
  if (source.parentFk != null) await refreshAreaType(db, source.parentFk)

  return { source, survivor: { ...survivor, ...patch } }
}

/** The privileged half: photos and everything else people attached to the source. */
export async function repointAreaMerge(
  db: Context['db'],
  { source, survivor }: Plan,
  { afterCommit, user }: Pick<Context, 'afterCommit' | 'user'>,
) {
  await repoint(db, 'files', 'area_fk', source.id, survivor.id)
  await repointLevel(db, 'areas', source.id, survivor, { afterCommit, user })
}
