import { areas, blocks, geolocations } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { blank, formError, type FormMessage } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { stringifyCoords } from '$lib/map/coords'
import type { Context } from '$lib/remote/authed.server'
import { requireRowForm } from '$lib/remote/require.server'
import { and, count, eq, isNull } from 'drizzle-orm'
import { refreshAreaType } from '../area/area.server'
import { canAddBlock } from '../area/permissions'
import { createUpdateEvent, insertEvent } from '../event/event.server'
import { notifyMentions } from '../notification/notification.server'
import type { blockActionSchema } from './dto'
import { blockPinFingerprint } from './fingerprint'
import { canEditBlock } from './permissions'
import { attachPin, lockLiveBlock, movePin, removePin } from './pin.server'

export type Refuse = (message: FormMessage, field?: 'name') => never

type Value = z.output<typeof blockActionSchema>
type Writer = Pick<Context, 'afterCommit' | 'db' | 'user' | 'userRegions'>

/** Create a block under a sector (or a still-untyped area, which a block turns into a sector).
 *  Location is optional: when given, a geolocation row is created and linked both ways. */
export async function createBlockRow(value: Value, { afterCommit, db, user, userRegions }: Writer, refuse: Refuse) {
  const area = await db.query.areas.findFirst({
    where: and(eq(areas.id, value.areaId), isNull(areas.deletedAt)),
  })

  if (area == null) {
    refuse(formError('areas_parentNotFound'))
  }

  if (!canAddBlock(userRegions, area)) {
    refuse(formError('form_noPermission'))
  }

  // Reject a duplicate name in the same area. Skip blank names: those render as
  // "Block {order}" (see the mapper), so several unnamed blocks are fine.
  const existingBlock =
    value.name.length === 0
      ? null
      : await db.query.blocks.findFirst({
          // Live siblings only, as in createArea: a cleared block reserving its name blocks a
          // create against something no screen shows the reader.
          where: (table, { and, eq, isNull }) =>
            and(isNull(table.deletedAt), eq(table.name, value.name), eq(table.areaFk, value.areaId)),
        })

  if (existingBlock != null) {
    refuse(formError('blocks_nameExists', { name: existingBlock.name }), 'name')
  }

  // `order` is 0-based, so the next slot is the count of existing (non-deleted) blocks.
  const [blocksCount] = await db
    .select({ count: count() })
    .from(blocks)
    .where(and(eq(blocks.areaFk, value.areaId), isNull(blocks.deletedAt)))

  const [block] = await db
    .insert(blocks)
    .values({
      areaFk: value.areaId,
      createdBy: user.id,
      // Empty stores as NULL, never '': "not set" gets one representation, so a later
      // `description IS NULL` means what it says. Same as `routes`. Trimmed, because the
      // editor reserialises an emptied document with a trailing newline (see `changed`).
      description: blank(value.description),
      name: value.name,
      order: blocksCount.count,
      regionFk: area.regionFk,
    })
    .returning()

  if (value.lat != null && value.long != null) {
    await attachPin(db, block, { estimated: value.estimated, lat: value.lat, long: value.long })
  }

  await refreshAreaType(db, value.areaId)

  // No name and no parent stored: a block soft-deletes, so `blocks.name` and `blocks.area_fk`
  // stay readable through the object key when the card renders.
  await insertEvent(db, {
    actorFk: user.id,
    object: { id: block.id, type: 'block' },
    regionFk: block.regionFk,
    verb: 'create',
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.description,
      object: { id: block.id, type: 'block' },
      regionFk: block.regionFk,
    }),
  )

  return { data: { id: block.id }, redirectTo: entityHref('blocks', block.id) }
}

/** Edit a block's name, description and/or location. Every one of the three is written on every
 *  submit, so a caller that omits a field CLEARS it; the form resubmits all three. The location is
 *  three-way: update the existing pin, attach a new one, or drop it entirely. */
export async function updateBlockRow(
  { id, ...value }: Value,
  { afterCommit, db, user, userRegions }: Writer,
  refuse: Refuse,
) {
  const block = await requireRowForm(
    () => (id == null ? Promise.resolve(undefined) : lockLiveBlock(db, id)),
    (row) => canEditBlock(userRegions, row),
    formError('blocks_notFound'),
  )

  // Reject a duplicate name in the same area, excluding this block. Blank names are fine
  // (they render as "Block {order}"), so skip the check when the name is cleared.
  const existingBlock =
    value.name.length === 0
      ? null
      : await db.query.blocks.findFirst({
          where: (table, { and, eq, isNull, ne }) =>
            and(
              isNull(table.deletedAt),
              eq(table.name, value.name),
              eq(table.areaFk, block.areaFk),
              ne(table.id, block.id),
            ),
        })

  if (existingBlock != null) {
    refuse(formError('blocks_nameExists', { name: existingBlock.name }), 'name')
  }

  // Read once: both the staleness proof's subject and the change line's `oldValue`.
  const storedPin =
    block.geolocationFk == null
      ? null
      : ((await db.query.geolocations.findFirst({ where: eq(geolocations.id, block.geolocationFk) })) ?? null)

  // Every submit carries the whole location, so one that omits it deletes the pin. Read before
  // the first write.
  if (value.known !== blockPinFingerprint(storedPin)) {
    refuse(formError('blocks_pinStale'))
  }

  // Sync the optional location: move the existing pin, attach a new one, or remove it. The two
  // sides of the pin are collected rather than logged here, so one submit writes one diff below.
  let geolocationFk = block.geolocationFk
  let oldLocation: null | string = null
  let newLocation: null | string = null
  if (value.lat != null && value.long != null) {
    const existing = storedPin

    oldLocation = existing == null ? null : stringifyCoords(existing, existing.estimated)
    newLocation = stringifyCoords({ lat: value.lat, long: value.long }, value.estimated)

    if (existing == null) {
      geolocationFk = (await attachPin(db, block, { estimated: value.estimated, lat: value.lat, long: value.long })).id
    } else {
      await movePin(db, existing.id, { estimated: value.estimated, lat: value.lat, long: value.long })
    }
  } else if (geolocationFk != null) {
    // Read the pin before dropping it: `oldValue` is the only place the feed can learn where
    // the block used to be, since the row it points at is about to be gone.
    const removed = storedPin
    oldLocation = removed == null ? null : stringifyCoords(removed, removed.estimated)

    await removePin(db, { geolocationFk, id: block.id })
    geolocationFk = null
  }

  await db
    .update(blocks)
    .set({
      description: blank(value.description),
      geolocationFk,
      name: value.name,
    })
    .where(eq(blocks.id, block.id))

  // One call for the whole submit, the way `updateRoute` does it: all three columns land on the
  // same event anyway, and a call apiece pays for the open-event lookup and the readback twice.
  //
  // The form resubmits the current pin on every save, so a name-only edit arrives here with
  // unchanged coordinates. `createUpdateEvent` compares before it writes, so that is a no-op
  // rather than a lie in the feed, and a burst of nudges merges into one change row that keeps
  // the original `oldValue`.
  await createUpdateEvent(db, {
    actorFk: user.id,
    newEntity: { description: value.description, location: newLocation, name: value.name },
    object: { id: block.id, type: 'block' },
    oldEntity: { description: block.description, location: oldLocation, name: block.name },
    regionFk: block.regionFk,
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.description,
      object: { id: block.id, type: 'block' },
      // Without this every save re-notifies everybody the description already named.
      previousBody: block.description,
      regionFk: block.regionFk,
    }),
  )

  return { redirectTo: entityHref('blocks', block.id) }
}
