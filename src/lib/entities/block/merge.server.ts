import { blocks, geolocations, routes, type Block } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { stringifyCoords } from '$lib/map/coords'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { chainRoutes, refreshAreaType, stampDeletedAt } from '../area/area.server'
import { createUpdateEvent } from '../event/event.server'
import { storedName } from '../event/storedName'
import { resolved } from '../merge/fields'
import { lockPair, repoint, repointLevel } from '../merge/repoint.server'
import { mergeBlocksSchema } from './dto'
import { liveIdsIn, renumberArea } from './order.server'
import { canDeleteBlock, canEditBlock } from './permissions'
import { removePin } from './pin.server'

// The pin is resolved on its own, below.
const BLOCK_MERGE_FIELDS = (
  Object.keys(mergeBlocksSchema.shape.values.shape) as (keyof z.output<typeof mergeBlocksSchema>['values'])[]
).filter((key) => key !== 'geolocationFk')

type Plan = { source: Block; survivor: Block }

/** The caller's half: gates, the survivor's fields and one pin, the source's routes, the retirement. */
export async function planBlockMerge(
  { sourceId, survivorId, values }: z.output<typeof mergeBlocksSchema>,
  { db, user, userRegions }: Pick<Context, 'db' | 'user' | 'userRegions'>,
): Promise<Plan> {
  const live = (id: number) => () =>
    db.query.blocks.findFirst({ where: and(eq(blocks.id, id), isNull(blocks.deletedAt)) })
  const source = await requireRow(
    live(sourceId),
    (row) => canDeleteBlock(userRegions, user.id, row),
    formError('blocks_notFound'),
  )
  const survivor = await requireRow(
    live(survivorId),
    (row) => canEditBlock(userRegions, row) && row.regionFk === source.regionFk && row.id !== source.id,
    formError('blocks_notFound'),
  )
  if (!(await lockPair(db, 'blocks', source.id, survivor.id))) {
    error(409, formError('blocks_notFound'))
  }

  const { geolocationFk: chosenPin, ...chosen } = values
  if (chosenPin != null && chosenPin !== source.geolocationFk && chosenPin !== survivor.geolocationFk) {
    error(400, formError('blocks_notFound'))
  }
  // One pin survives: the chosen one, else the survivor's, else the source's. The other is deleted, never orphaned.
  const pin = chosenPin ?? survivor.geolocationFk ?? source.geolocationFk
  // Read before either pin can be deleted: the history entry names where the block was and is.
  const pins = await db
    .select()
    .from(geolocations)
    .where(
      inArray(
        geolocations.id,
        [survivor.geolocationFk, pin].filter((id) => id != null),
      ),
    )
  const locationOf = (id: null | number) => {
    const row = pins.find((p) => p.id === id)
    return row == null ? null : stringifyCoords(row, row.estimated)
  }
  const patch: Partial<Block> = { ...(resolved(survivor, source, BLOCK_MERGE_FIELDS, chosen) as Partial<Block>) }
  if (source.geolocationFk != null && source.geolocationFk !== pin) {
    await removePin(db, { geolocationFk: source.geolocationFk, id: source.id })
  }
  if (pin !== survivor.geolocationFk) {
    await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, source.id))
    if (survivor.geolocationFk != null) await removePin(db, { geolocationFk: survivor.geolocationFk, id: survivor.id })
    if (pin != null) await db.update(geolocations).set({ blockFk: survivor.id }).where(eq(geolocations.id, pin))
    patch.geolocationFk = pin
  }
  if (Object.keys(patch).length > 0)
    await db
      .update(blocks)
      .set({
        description: patch.description,
        geolocationFk: patch.geolocationFk,
        name: patch.name,
      } satisfies Record<keyof typeof values, unknown>)
      .where(eq(blocks.id, survivor.id))

  // Every route, deleted ones too, so a later restore lands it under the survivor.
  await db.update(routes).set({ blockFk: survivor.id }).where(eq(routes.blockFk, source.id))
  if (survivor.areaFk !== source.areaFk) await chainRoutes(db, survivor.areaFk, eq(routes.blockFk, survivor.id))

  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: {
      description: patch.description,
      location: locationOf(pin),
      mergedFrom: storedName(source.name, source.order),
      name: patch.name,
    },
    object: { id: survivor.id, type: 'block' },
    oldEntity: {
      description: patch.description === undefined ? undefined : survivor.description,
      location: locationOf(survivor.geolocationFk),
      mergedFrom: null,
      name: patch.name === undefined ? undefined : survivor.name,
    },
    regionFk: survivor.regionFk,
  })
  await stampDeletedAt(db, { blockIds: [source.id] }, new Date(), null)
  await db.update(blocks).set({ mergedInto: survivor.id }).where(eq(blocks.id, source.id))
  await renumberArea(db, await liveIdsIn(db, source.areaFk))
  await refreshAreaType(db, source.areaFk)

  return { source, survivor: { ...survivor, ...patch } }
}

/** The privileged half: topos, photos and everything else people attached to the source. */
export async function repointBlockMerge(
  db: Context['db'],
  { source, survivor }: Plan,
  { afterCommit, user }: Pick<Context, 'afterCommit' | 'user'>,
) {
  // Topos move whole, so the moved routes' lines stay on the photos they trace.
  await repoint(db, 'topos', 'block_fk', source.id, survivor.id)
  await repoint(db, 'files', 'block_fk', source.id, survivor.id)
  await repointLevel(db, 'blocks', source.id, survivor, { afterCommit, user })
}
