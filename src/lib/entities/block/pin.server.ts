import * as schema from '$lib/db/schema'
import { blocks, geolocations } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { stringifyCoords } from '$lib/map/coords'
import type { Context } from '$lib/remote/authed.server'
import { requireRow } from '$lib/remote/require.server'
import { and, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createUpdateEvent } from '../event/event.server'
import type { blockPinSchema } from './dto'
import { canEditBlock } from './permissions'

type Caller = Pick<Context, 'db' | 'user' | 'userRegions'>

type Db = PostgresJsDatabase<typeof schema>

type PinValue = z.output<typeof blockPinSchema>

/** A block's pin is a geolocation row it points at, which points back. Never `areaFk`: that marks a
 *  parking, which `deleteParking` removes under a different permission. */
export async function attachPin(
  db: Db,
  block: { id: number; regionFk: number },
  at: { estimated: boolean; lat: number; long: number },
) {
  const [pin] = await db
    .insert(geolocations)
    .values({ blockFk: block.id, estimated: at.estimated, lat: at.lat, long: at.long, regionFk: block.regionFk })
    .returning()
  await db.update(blocks).set({ geolocationFk: pin.id }).where(eq(blocks.id, block.id))
  return pin
}

/** Backfill a rough pin from a topo photo's GPS EXIF when the block has none yet. Marked
 *  `estimated`, and a no-op once the block has any geolocation, so it never overrides a real pin. */
export async function estimateBlockLocationRow(value: PinValue, { db, user, userRegions }: Caller) {
  const block = await requireEditableBlock(db, value.id, userRegions)

  if (block.geolocationFk != null) return

  await attachPin(db, block, { estimated: true, lat: value.lat, long: value.long })

  // Always the first pin (the guard above returns when the block has one), so no old value.
  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { location: stringifyCoords(value, true) },
    object: { id: block.id, type: 'block' },
    oldEntity: { location: null },
    regionFk: block.regionFk,
  })
}

/** The live block, row-locked to commit. Every pin writer loads through this, so two first pins
 *  cannot both read "no pin" and orphan one; the later save waits and sees the earlier pin.
 *  `for update` applies the UPDATE policy, so a reader without edit rights gets not-found, not 403. */
export async function lockLiveBlock(db: Context['db'], id: number) {
  const [row] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, id), isNull(blocks.deletedAt)))
    .for('update')
  return row
}

/** Move a pin in place. An omitted `estimated` keeps the stored flag (drizzle skips undefined): a map
 *  drag confirms nothing. */
export async function movePin(db: Db, pinId: number, at: { estimated?: boolean; lat: number; long: number }) {
  await db
    .update(geolocations)
    .set({ estimated: at.estimated, lat: at.lat, long: at.long })
    .where(eq(geolocations.id, pinId))
}
/** Drop a pin: the block's link first, so the row it points at can be deleted. */
export async function removePin(db: Db, block: { geolocationFk: number; id: number }) {
  await db.update(blocks).set({ geolocationFk: null }).where(eq(blocks.id, block.id))
  await db.delete(geolocations).where(eq(geolocations.id, block.geolocationFk))
}

/** Move-on-the-map shortcut: set the block's pin straight from the picker, skipping the
 *  edit form. Upserts the geolocation (and links it on first set). */
export async function setBlockLocationRow(value: PinValue, { db, user, userRegions }: Caller) {
  const block = await requireEditableBlock(db, value.id, userRegions)

  const existing =
    block.geolocationFk == null
      ? null
      : await db.query.geolocations.findFirst({ where: eq(geolocations.id, block.geolocationFk) })

  if (existing == null) {
    await attachPin(db, block, { estimated: false, lat: value.lat, long: value.long })
  } else {
    await movePin(db, existing.id, { lat: value.lat, long: value.long })
  }

  // The pin dragged on the map keeps whatever `estimated` flag it had: this move confirms
  // nothing, it only relocates. Clearing the flag is the edit form's job.
  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { location: stringifyCoords(value, existing?.estimated) },
    object: { id: block.id, type: 'block' },
    oldEntity: { location: existing == null ? null : stringifyCoords(existing, existing.estimated) },
    regionFk: block.regionFk,
  })

  return { redirectTo: entityHref('blocks', block.id) }
}

/** The live block a pin command names, once the caller is allowed to move it. */
function requireEditableBlock(db: Context['db'], id: number, userRegions: Context['userRegions']) {
  return requireRow(
    () => lockLiveBlock(db, id),
    (row) => canEditBlock(userRegions, row),
    formError('blocks_notFound'),
  )
}
