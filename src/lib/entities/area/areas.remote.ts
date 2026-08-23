import { resolve } from '$app/paths'
import { areas, blocks, files, geolocations, routes, type Area } from '$lib/db/schema'
import { boundedDegrees, coordinate, formError, stringToInt, stringToIntOptional } from '$lib/forms/schemas'
import { stringifyCoords } from '$lib/map/coords'
import { decodePath } from '$lib/map/polyline'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { requireRow } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { and, count, eq, inArray, isNull, not } from 'drizzle-orm'
import z from 'zod'
import { canHardDelete, createUpdateEvent, deleteEvent, insertEvent } from '../event/event.server'
import { stringifyDeletionScale } from '../event/verbs'
import { notifyMentions } from '../notification/notification.server'
import { refreshAreaType } from './area.server'
import { loadParentArea, requireEditableArea } from './guards.server'
import { canAddArea, canAddParking, canDeleteArea, canDeleteParking } from './permissions'

const areaActionSchema = z.object({
  description: z.string().optional().default(''),
  id: stringToInt.optional(),
  name: z
    .string({ error: formError('form_required') })
    .trim()
    .min(3, { error: formError('form_charsMin', { count: 3 }) }),
  // `stringToIntOptional`, not `stringToInt.optional()`: the latter admits `undefined` and nothing
  // else, while a top-level area's hidden `parentFk` submits an EMPTY STRING. That was refused with
  // `form_numInvalid` on a field the edit form does not render, so Save did nothing and said
  // nothing. "No parent" and "field absent" are the same thing here, and both spell '' in a form.
  parentFk: stringToIntOptional,
  regionFk: stringToInt,
})

/** Field shape the shared area form (`AreaFormFields`) binds to — same for create and edit. */
export type AreaFormInput = z.input<typeof areaActionSchema>

export const createArea = authedForm(areaActionSchema, async (value, { afterCommit, db, user, userRegions }, issue) => {
  const { parent: parentArea, status } = await loadParentArea(db, value.parentFk, value.regionFk)

  if (status === 'missing') {
    invalid(formError('areas_parentNotFound'))
  }

  if (
    !canAddArea(userRegions, { ...value, type: null }) ||
    (parentArea != null && !canAddArea(userRegions, parentArea))
  ) {
    invalid(formError('form_noPermission'))
  }

  // A child must live in its parent's region; otherwise it could be created in region A
  // under a parent in region B, where B can neither see nor moderate it.
  if (status === 'wrongRegion') {
    invalid(formError('form_noPermission'))
  }

  const existingAreasResult = await db.query.areas.findMany({
    where: and(
      eq(areas.name, value.name),
      parentArea == null ? eq(areas.regionFk, value.regionFk) : eq(areas.parentFk, parentArea.id),
    ),
  })

  if (existingAreasResult.length > 0) {
    invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
  }

  // `regionFk` and `parentFk` are client-supplied here on purpose: on a create there is no stored
  // row to disagree with, `canAddArea` gates on exactly these values, and `loadParentArea` has
  // already refused a cross-region parent.
  const [createdArea] = await db
    .insert(areas)
    .values({
      createdBy: user.id,
      description: value.description,
      name: value.name,
      parentFk: value.parentFk,
      regionFk: value.regionFk,
      // Derived, never submitted: `refreshAreaType` owns this column (a block makes a crag, a
      // sub-area makes an area). A new area holds neither, so it starts untyped.
      type: null,
    })
    .returning()

  if (value.parentFk != null) {
    await refreshAreaType(db, value.parentFk)
  }

  // No name and no parent stored: an area soft-deletes, so `areas.name` and `areas.parent_fk`
  // are still readable through the object key when the card renders.
  await insertEvent(db, {
    actorFk: user.id,
    object: { id: createdArea.id, type: 'area' },
    regionFk: createdArea.regionFk,
    verb: 'create',
  })

  afterCommit(() =>
    notifyMentions({
      actorFk: user.id,
      body: value.description,
      object: { id: createdArea.id, type: 'area' },
      regionFk: createdArea.regionFk,
    }),
  )

  return { redirectTo: resolve('/(app)/areas/[id]', { id: createdArea.id.toString() }) }
})

export const updateArea = authedForm(
  areaActionSchema,
  async ({ id, ...value }, { afterCommit, db, user, userRegions }, issue) => {
    const area = await requireEditableArea(db, userRegions, id)

    const existingAreasResult = await db.query.areas.findMany({
      where: and(
        eq(areas.name, value.name),
        area.parentFk == null ? isNull(areas.parentFk) : eq(areas.parentFk, area.parentFk),
        not(eq(areas.id, area.id)),
      ),
    })

    if (existingAreasResult.length > 0) {
      invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
    }

    // Explicit columns, not a spread: `areaActionSchema` is shared with `createArea` and also carries
    // `regionFk` and `parentFk`. See `no-drizzle-mass-assignment` in eslint.config.js.
    await db.update(areas).set({ description: value.description, name: value.name }).where(eq(areas.id, area.id))

    await createUpdateEvent(db, {
      actorFk: user.id,
      newEntity: { description: value.description, name: value.name },
      object: { id: area.id, type: 'area' },
      oldEntity: { description: area.description, name: area.name },
      regionFk: area.regionFk,
    })

    afterCommit(() =>
      notifyMentions({
        actorFk: user.id,
        body: value.description,
        object: { id: area.id, type: 'area' },
        previousBody: area.description,
        regionFk: area.regionFk,
      }),
    )

    return { redirectTo: resolve('/(app)/areas/[id]', { id: area.id.toString() }) }
  },
)

/** Snapshot {@link deleteArea} returns so {@link restoreArea} can undo either delete path. */
type DeleteAreaSnapshot =
  | {
      // No `type`: it is derived state (`refreshAreaType`), so the restore recomputes it rather than
      // trusting a value that has been through the client. A hard delete only ever runs on an area
      // with no blocks and no sub-areas, which is exactly the state that derives to `null` anyway.
      area: Pick<Area, 'description' | 'geoPaths' | 'name' | 'parentFk' | 'regionFk' | 'walkingPaths'>
      areaId: number
      mode: 'hard'
      parking: { lat: number; long: number }[]
    }
  // No `deletedAt`: read off the stored row rather than accepted from the client (see `softRestoreArea`).
  | { areaId: number; mode: 'soft' }

/** Collect `rootId` and every area transitively nested beneath it (via `parentFk`).
 *  Cycle-safe; a level-by-level loop is plenty for the shallow area trees we have. */
async function collectAreaSubtreeIds(db: Context['db'], rootId: number): Promise<number[]> {
  const ids = [rootId]
  let frontier = [rootId]

  while (frontier.length > 0) {
    const children = await db.query.areas.findMany({ columns: { id: true }, where: inArray(areas.parentFk, frontier) })
    frontier = children.map((child) => child.id).filter((id) => !ids.includes(id))
    ids.push(...frontier)
  }

  return ids
}

/** Hard-delete a leaf area. Its parking geolocations FK-block the row delete, so remove them
 *  first and snapshot them for undo; the area's own fields recreate it. */
async function hardDeleteArea(db: Context['db'], area: Area): Promise<DeleteAreaSnapshot> {
  const parking = await db.query.geolocations.findMany({ where: eq(geolocations.areaFk, area.id) })
  await db.delete(geolocations).where(eq(geolocations.areaFk, area.id))
  await db.delete(areas).where(eq(areas.id, area.id))

  return {
    area: {
      description: area.description,
      geoPaths: area.geoPaths,
      name: area.name,
      parentFk: area.parentFk,
      regionFk: area.regionFk,
      walkingPaths: area.walkingPaths,
    },
    areaId: area.id,
    mode: 'hard',
    parking: parking.map(({ lat, long }) => ({ lat, long })),
  }
}

/** Soft-delete an area with descendants: stamp one `deletedAt` across the subtree (area +
 *  descendant areas, their blocks, those blocks' routes). The shared timestamp is the restore
 *  key. Only touch rows not already deleted, so restore won't resurrect independently-deleted
 *  ones. The caller walked the subtree to decide hard-vs-soft and hands the ids over, so the
 *  walk does not happen twice. ponytail: timestamp as restore key; sub-ms collision with a
 *  concurrent delete is the ceiling. Upgrade = a dedicated deletion-batch id column. */
async function softDeleteArea(
  db: Context['db'],
  area: Area,
  areaIds: number[],
  blockIds: number[],
): Promise<DeleteAreaSnapshot> {
  const deletedAt = new Date()

  await db
    .update(areas)
    .set({ deletedAt })
    .where(and(inArray(areas.id, areaIds), isNull(areas.deletedAt)))
  if (blockIds.length > 0) {
    await db
      .update(blocks)
      .set({ deletedAt })
      .where(and(inArray(blocks.id, blockIds), isNull(blocks.deletedAt)))
    await db
      .update(routes)
      .set({ deletedAt })
      .where(and(inArray(routes.blockFk, blockIds), isNull(routes.deletedAt)))
  }

  return { areaId: area.id, mode: 'soft' }
}

/** Delete an area. A leaf area (no sub-areas, blocks or files) is hard-deleted; anything
 *  with descendants is soft-deleted across the whole subtree. Returns the snapshot
 *  {@link restoreArea} needs to undo either path. */
export const deleteArea = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteAreaSnapshot>> => {
    const area = await requireRow(
      () => db.query.areas.findFirst({ where: eq(areas.id, id) }),
      (row) => canDeleteArea(userRegions, user.id, row),
      'Area not found',
    )

    // Sub-areas and blocks are the spec's "children"; files are folded in because they
    // FK-reference the area and can't be recreated on undo — an area with files is
    // soft-deleted rather than hard-deleted so nothing is lost.
    // The whole subtree, not just the direct children: deleting a crag takes its blocks and
    // their routes with it, and after the delete none of it is left to count.
    //
    // The existence checks count soft-deleted descendants too: a row stamped last month still
    // FK-references this area, so hard-deleting around it would fail. What the card SAYS was
    // taken is a different question with a different answer, which is why the counts below
    // ask again with `deletedAt IS NULL`.
    const areaIds = await collectAreaSubtreeIds(db, id)
    const [blockRows, file] = await Promise.all([
      db.query.blocks.findMany({ columns: { deletedAt: true, id: true }, where: inArray(blocks.areaFk, areaIds) }),
      db.query.files.findFirst({ columns: { id: true }, where: eq(files.areaFk, id) }),
    ])
    const blockIds = blockRows.map((row) => row.id)

    // Counted, not listed: a crag holds thousands of routes and the card needs one integer.
    // Live rows only, and before the delete stamps them - this is what this deletion takes.
    const [[areaCount], [routeCount]] = await Promise.all([
      db
        .select({ value: count() })
        .from(areas)
        .where(and(inArray(areas.id, areaIds), isNull(areas.deletedAt))),
      blockIds.length === 0
        ? Promise.resolve([{ value: 0 }])
        : db
            .select({ value: count() })
            .from(routes)
            .where(and(inArray(routes.blockFk, blockIds), isNull(routes.deletedAt))),
    ])

    // Childless is necessary but no longer sufficient: `events.area_fk` cascades, so erasing an
    // area that has been in the log for a while takes its history, and one somebody has reacted
    // to takes their words.
    const erasable = await canHardDelete(db, {
      childless: areaIds.length === 1 && blockRows.length === 0 && file == null,
      createdAt: area.createdAt,
      object: { id, type: 'area' },
    })

    const data = erasable ? await hardDeleteArea(db, area) : await softDeleteArea(db, area, areaIds, blockIds)

    // Soft path only. `events.area_fk` is an immediate foreign key, so an event written after the
    // row is gone aborts the transaction, and one written before it is cascaded away a statement
    // later: a mistake inside the grace window leaves no trace either way.
    if (!erasable) {
      await insertEvent(db, {
        actorFk: user.id,
        // What went with it, recorded while it is still knowable: the counts are gone the moment
        // the children are stamped. The area's own name is not stored, because the soft delete
        // keeps the row readable.
        metadata: stringifyDeletionScale({
          areas: Math.max(0, areaCount.value - 1),
          blocks: blockRows.filter((row) => row.deletedAt == null).length,
          routes: routeCount.value,
        }),
        object: { id: area.id, type: 'area' },
        regionFk: area.regionFk,
        verb: 'delete',
      })
    }
    if (area.parentFk != null) await refreshAreaType(db, area.parentFk)

    const redirectTo =
      area.parentFk == null
        ? resolve('/explore')
        : resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(area.parentFk) })

    return { data, redirectTo }
  },
)

const restoreAreaSchema = z.discriminatedUnion('mode', [
  z.object({
    area: z.object({
      description: z.string().nullable().optional(),
      geoPaths: z.array(z.string()).nullable().optional(),
      name: z.string(),
      parentFk: z.number().nullable().optional(),
      regionFk: z.number(),
      walkingPaths: z.array(z.string()).nullable().optional(),
    }),
    areaId: z.number(),
    mode: z.literal('hard'),
    // Bounded like every other coordinate this app accepts (`coordinate(90)` on `addParking`).
    // `geolocations` has no CHECK constraint, so an unbounded snapshot was the one door that could
    // store a parking at lat 999 and drag every map that fits its markers along with it.
    parking: z.array(z.object({ lat: boundedDegrees(90), long: boundedDegrees(180) })),
  }),
  // No `deletedAt` to accept: the restore reads it off the stored area, not the client (see `softRestoreArea`).
  z.object({ areaId: z.number(), mode: z.literal('soft') }),
])

/** What {@link restoreArea} receives — the parsed snapshot, whose optional/nullable area fields
 *  differ from {@link DeleteAreaSnapshot}, so the restore helpers key off this. */
type RestoreAreaSnapshot = z.infer<typeof restoreAreaSchema>

/** Recreate a hard-deleted area with its parking. Returns the new row (its `parentFk` drives
 *  the parent's type refresh). */
async function hardRestoreArea(
  db: Context['db'],
  snapshot: Extract<RestoreAreaSnapshot, { mode: 'hard' }>,
  createdBy: number,
): Promise<Area> {
  // The snapshot is client-supplied, so `createdBy` is the caller and `type` is forced to null
  // rather than trusted: the gate asks `canAddArea` with `type: null`, which refuses 'crag', so a
  // snapshot naming 'crag' used to mint through undo a row that create would have rejected and
  // `canAddParking` accepts. `refreshAreaType` owns that column anyway.
  const [created] = await db
    .insert(areas)
    .values({
      createdBy,
      description: snapshot.area.description,
      geoPaths: snapshot.area.geoPaths,
      name: snapshot.area.name,
      parentFk: snapshot.area.parentFk,
      regionFk: snapshot.area.regionFk,
      type: null,
      walkingPaths: snapshot.area.walkingPaths,
    })
    .returning()

  if (snapshot.parking.length > 0) {
    await db
      .insert(geolocations)
      .values(snapshot.parking.map(({ lat, long }) => ({ areaFk: created.id, lat, long, regionFk: created.regionFk })))
  }

  return created
}

/** Clear the `deletedAt` the soft delete stamped across the subtree, un-hiding the area, its
 *  descendant areas, blocks and routes together.
 *
 *  Scoped to the subtree AND to the timestamp, and it takes the stored area rather than the
 *  snapshot. The three statements used to match on `deletedAt = <client-supplied timestamp>` and
 *  nothing else: `deleted_at` is not unique, carries no region, and `deleteArea` returned it to the
 *  client, so the WHERE described a moment in time. Any other region's subtree stamped in the same
 *  millisecond came back with this one, and a caller holding an old timestamp could post it to
 *  revive whatever had been deleted then, anywhere, having been authorized for one area. The
 *  permission check upstream reads `snapshot.areaId`, which the old statements never mentioned.
 *
 *  The timestamp still earns its place beside the ids: it is what keeps a descendant that was
 *  deleted independently last month from being resurrected by this undo. */
async function softRestoreArea(db: Context['db'], area: Area): Promise<void> {
  if (area.deletedAt == null) {
    return
  }

  const areaIds = await collectAreaSubtreeIds(db, area.id)
  const blockRows = await db.query.blocks.findMany({ columns: { id: true }, where: inArray(blocks.areaFk, areaIds) })
  const blockIds = blockRows.map((row) => row.id)

  await db
    .update(areas)
    .set({ deletedAt: null })
    .where(and(inArray(areas.id, areaIds), eq(areas.deletedAt, area.deletedAt)))
  if (blockIds.length > 0) {
    await db
      .update(blocks)
      .set({ deletedAt: null })
      .where(and(inArray(blocks.id, blockIds), eq(blocks.deletedAt, area.deletedAt)))
    await db
      .update(routes)
      .set({ deletedAt: null })
      .where(and(inArray(routes.blockFk, blockIds), eq(routes.deletedAt, area.deletedAt)))
  }
}

/** Undo a {@link deleteArea}: recreate the hard-deleted area (with its parking), or clear
 *  the `deletedAt` the soft delete stamped across the subtree. Either way, the delete event
 *  goes with it so the timeline reads as if it never happened. */
export const restoreArea = authedCommand(restoreAreaSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    // The snapshot came from the client, so re-validate its structural placement the way createArea
    // does - otherwise a DELETE holder could restore an area claiming their region but nested under a
    // parent in another region, which that region can neither see nor moderate.
    const { parent: parentArea, status } = await loadParentArea(db, snapshot.area.parentFk, snapshot.area.regionFk)

    if (status === 'missing') {
      error(404, formError('areas_parentNotFound'))
    }
    if (status === 'wrongRegion') {
      error(403, formError('form_noPermission'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one. Gating on
    // canDeleteArea instead would deny the undo to the EDITor who just deleted their own area:
    // the snapshot carries no `createdBy`, so that predicate's own-created branch can never fire.
    if (
      !canAddArea(userRegions, { regionFk: snapshot.area.regionFk, type: null }) ||
      (parentArea != null && !canAddArea(userRegions, parentArea))
    ) {
      error(403, formError('form_noPermission'))
    }

    const created = await hardRestoreArea(db, snapshot, user.id)

    if (created.parentFk != null) await refreshAreaType(db, created.parentFk)
    // Nothing to move onto the new id: only an area inside the grace window is hard-deleted, and
    // `events.area_fk on delete cascade` took its entire log with it.

    return {
      data: { areaId: created.id },
      redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(created.id) }),
    }
  }

  const area = await db.query.areas.findFirst({ where: eq(areas.id, snapshot.areaId) })

  if (area == null || !canDeleteArea(userRegions, user.id, area)) {
    error(403, formError('form_noPermission'))
  }

  // Nothing to undo. A replayed Undo, a double-tapped snackbar or a stale snapshot all arrive here
  // on a live area, and the rest of this handler would then erase a `deleted` card for something
  // standing right there. The guard belongs at the caller rather than inside `softRestoreArea`, so
  // the whole undo is a no-op instead of half of one.
  if (area.deletedAt == null) {
    return {
      data: { areaId: snapshot.areaId },
      redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(snapshot.areaId) }),
    }
  }

  // The stored area, not the snapshot: `canDeleteArea` above authorized THIS row, so this is the
  // row the restore has to be scoped to.
  await softRestoreArea(db, area)

  if (area.parentFk != null) await refreshAreaType(db, area.parentFk)
  // The delete event and nothing else: the area's own create and every edit ever made to it
  // still point at this id and stay live.
  await deleteEvent(db, { object: { id: snapshot.areaId, type: 'area' }, verb: 'delete' })

  return {
    data: { areaId: snapshot.areaId },
    redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(snapshot.areaId) }),
  }
})

/** Insert a parking geolocation on `area`, appending its optional approach path to the
 *  area's `geoPaths`. Shared by `addParking` and the undo path (`restoreParking`). */
async function createParking(
  db: Context['db'],
  area: Area,
  { lat, long, path }: { lat: number; long: number; path?: string },
) {
  await db.insert(geolocations).values({ areaFk: area.id, lat, long, regionFk: area.regionFk })

  if (path != null && path.length > 0) {
    await db
      .update(areas)
      .set({ geoPaths: [...(area.geoPaths ?? []), path] })
      .where(eq(areas.id, area.id))
  }
}

/** Add a parking location (a geolocation row) to a crag-type area, optionally with
 *  an approach path (an encoded polyline appended to the area's `geoPaths`). */
export const addParking = authedForm(
  z.object({ areaId: stringToInt, lat: coordinate(90), long: coordinate(180), path: z.string().optional() }),
  async ({ areaId, lat, long, path }, { db, user, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (area == null || !canAddParking(userRegions, area)) {
      invalid(formError('form_noPermission'))
    }

    await createParking(db, area, { lat, long, path })

    // An event with the coordinates in `metadata`, NOT a change row on the area. An area holds
    // several parkings and each one is its own thing added, not a field of the area moving from
    // one value to another: as a change they would all key on one column name, where
    // `changes_event_fk_column_name_idx` merges them into a single row and the second parking
    // erases the first. Metadata scopes the fold instead, so two parkings are two events.
    await insertEvent(db, {
      actorFk: user.id,
      metadata: stringifyCoords({ lat, long }),
      object: { id: area.id, type: 'area' },
      regionFk: area.regionFk,
      verb: 'add',
    })

    return { redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: areaId.toString() }) }
  },
)

/** Remove a parking location. Needs delete permission in the parking's region (adding one
 *  takes edit, but removing one is destructive - see canDeleteParking). */
export const deleteParking = authedCommand(z.object({ id: z.number() }), async ({ id }, { db, user, userRegions }) => {
  const parking = await db.query.geolocations.findFirst({ where: eq(geolocations.id, id) })

  // Guard against deleting a block's location through this route: only an
  // area-attached geolocation (areaFk set) is a parking.
  if (parking == null || parking.areaFk == null) {
    error(404, 'Parking not found')
  }

  if (!canDeleteParking(userRegions, parking)) {
    error(403, formError('form_noPermission'))
  }

  await db.delete(geolocations).where(eq(geolocations.id, id))

  // The approach path drawn from this parking was seeded at its coordinates, so its
  // first point identifies it in the area's flat `geoPaths` array. Drop that entry,
  // capturing it so `restoreParking` can put it back on undo.
  // ponytail: ~11m head match; nearby parkings can collide. Upgrade = link path↔parking.
  const area = await db.query.areas.findFirst({ where: eq(areas.id, parking.areaFk) })
  const geoPaths = area?.geoPaths ?? []
  let removedPath: string | undefined
  const remaining = geoPaths.filter((encoded) => {
    let head: [number, number] | undefined
    try {
      head = decodePath(encoded)[0]
    } catch {
      return true // keep malformed entries — they aren't this parking's path
    }
    const matches = head != null && Math.abs(head[0] - parking.lat) <= 1e-4 && Math.abs(head[1] - parking.long) <= 1e-4
    if (matches && removedPath == null) removedPath = encoded
    return !matches
  })

  if (area != null && remaining.length !== geoPaths.length) {
    await db.update(areas).set({ geoPaths: remaining }).where(eq(areas.id, area.id))
  }

  // The coordinates in `metadata` for the same reason the add stores them there, plus one this
  // side only: the row that could answer where the parking was is gone by now.
  if (area != null) {
    await insertEvent(db, {
      actorFk: user.id,
      metadata: stringifyCoords(parking),
      object: { id: area.id, type: 'area' },
      regionFk: area.regionFk,
      verb: 'remove',
    })
  }

  // Back to the area, plus a snapshot (the envelope's `data`) to recreate the parking on Undo.
  return {
    data: {
      areaId: parking.areaFk,
      lat: parking.lat,
      long: parking.long,
      path: removedPath,
    },
    redirectTo: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(parking.areaFk) }),
  }
})

/** Undo a {@link deleteParking}: recreate the parking from the snapshot the delete returned. */
export const restoreParking = authedCommand(
  z.object({ areaId: z.number(), lat: boundedDegrees(90), long: boundedDegrees(180), path: z.string().optional() }),
  async ({ areaId, lat, long, path }, { db, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: eq(areas.id, areaId) })

    if (area == null || !canAddParking(userRegions, area)) {
      error(403, formError('form_noPermission'))
    }

    await createParking(db, area, { lat, long, path })

    // Keyed on the coordinates rather than on who removed the parking: any admin's undo erases
    // the record, and an area's other parkings carry other coordinates and survive.
    await deleteEvent(db, {
      metadata: stringifyCoords({ lat, long }),
      object: { id: areaId, type: 'area' },
      regionFk: area.regionFk,
      verb: 'remove',
    })
  },
)
