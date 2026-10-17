import { resolve } from '$app/paths'
import { areas, blocks, files, geolocations, routes, type Area } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import {
  blank,
  boundedDegrees,
  coordinate,
  formError,
  intFromString,
  stringToInt,
  stringToIntOptional,
} from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { stringifyCoords } from '$lib/map/coords'
import { decodePath } from '$lib/map/polyline'
import { authedCommand, authedForm, type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { answerReplayedRestore, requireIssuedId, requireRow } from '$lib/remote/require.server'
import { error, invalid } from '@sveltejs/kit'
import { and, count, eq, inArray, isNull, not } from 'drizzle-orm'
import { canHardDelete, createUpdateEvent, deleteEvent, insertEvent } from '../event/event.server'
import { stringifyDeletionScale } from '../event/verbs'
import { notifyMentions } from '../notification/notification.server'
import { hasDeletedAncestor, refreshAreaType } from './area.server'
import { loadParentArea, requireEditableArea } from './guards.server'
import {
  collectAreaSubtreeIds,
  hardDeleteArea,
  hardRestoreArea,
  restoreAreaSchema,
  softDeleteArea,
  softRestoreArea,
  type DeleteAreaSnapshot,
} from './lifecycle.server'
import { canAddArea, canAddParking, canDeleteArea, canDeleteParking } from './permissions'

/** Areas sharing a parent; top-level ones share their region. Name clashes are checked over these. */
const siblingsOf = (regionFk: number, parentFk: null | number | undefined) =>
  parentFk == null ? and(eq(areas.regionFk, regionFk), isNull(areas.parentFk)) : eq(areas.parentFk, parentFk)

const areaActionSchema = z.object({
  description: z._default(z.optional(z.string()), ''),
  id: z.optional(stringToInt),
  name: z
    .string({ error: formError('form_required') })
    .check(z.trim(), z.minLength(3, { error: formError('form_charsMin', { count: 3 }) })),
  // For `parentFk`, `stringToIntOptional` and not `z.optional(stringToInt)`. The latter admits
  // `undefined` and nothing else, while a top-level area's hidden `parentFk` submits an EMPTY
  // STRING. That was refused with `form_numInvalid` on a field the edit form does not render, so
  // Save did nothing and said nothing. "No parent" and "field absent" are the same thing here, and
  // both spell '' in a form. `id` above is the other case and is fine as it stands: the form omits
  // it entirely on a create rather than submitting it blank.
  parentFk: stringToIntOptional,
  // Not `stringToInt`: this renders as a `<select>`, and its generic "enter a valid number" was
  // being shown to somebody whose only available action is to pick one.
  regionFk: intFromString(formError('areas_regionRequired')),
})

/** Field shape the shared area form (`AreaFormFields`) binds to: same for create and edit. */
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

  // Live siblings only: a cleared one is absent from the tree, the map and search, so refusing
  // against it names a blocker the reader cannot find or clear. Restoring it later can leave two
  // siblings sharing a name, which is the accepted cost of the reader-facing reading.
  const existingAreasResult = await db.query.areas.findMany({
    where: and(isNull(areas.deletedAt), eq(areas.name, value.name), siblingsOf(value.regionFk, parentArea?.id)),
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
      // Empty stores as NULL, never '': "not set" gets one representation, so a later
      // `description IS NULL` means what it says. Same as `routes` and `blocks`. Trimmed,
      // because the editor reserialises an emptied document with a trailing newline.
      description: blank(value.description),
      name: value.name,
      parentFk: value.parentFk,
      regionFk: value.regionFk,
      // Derived, never submitted: `refreshAreaType` owns this column (a block makes a sector, a
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

  return { redirectTo: entityHref('areas', createdArea.id) }
})

export const updateArea = authedForm(
  areaActionSchema,
  async ({ id, ...value }, { afterCommit, db, user, userRegions }, issue) => {
    const area = await requireEditableArea(db, userRegions, id)

    const existingAreasResult = await db.query.areas.findMany({
      where: and(
        isNull(areas.deletedAt),
        eq(areas.name, value.name),
        siblingsOf(area.regionFk, area.parentFk),
        not(eq(areas.id, area.id)),
      ),
    })

    if (existingAreasResult.length > 0) {
      invalid(issue.name(formError('areas_nameExists', { name: existingAreasResult[0].name })))
    }

    // Explicit columns, not a spread: `areaActionSchema` is shared with `createArea` and also carries
    // `regionFk` and `parentFk`. See `no-drizzle-mass-assignment` in eslint.config.js.
    await db
      .update(areas)
      .set({ description: blank(value.description), name: value.name })
      .where(eq(areas.id, area.id))

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

    return { redirectTo: entityHref('areas', area.id) }
  },
)

/** Delete an area. A leaf area (no sub-areas, blocks or files) is hard-deleted; anything
 *  with descendants is soft-deleted across the whole subtree. Returns the snapshot
 *  {@link restoreArea} needs to undo either path. */
export const deleteArea = authedCommand(
  z.object({ id: z.number() }),
  async ({ id }, { db, user, userRegions }): Promise<MutationResult<DeleteAreaSnapshot>> => {
    const area = await requireRow(
      () => db.query.areas.findFirst({ where: and(eq(areas.id, id), isNull(areas.deletedAt)) }),
      (row) => canDeleteArea(userRegions, user.id, row),
      formError('areas_notFound'),
    )

    // Sub-areas and blocks are the spec's "children"; files are folded in because they
    // FK-reference the area and can't be recreated on undo: an area with files is
    // soft-deleted rather than hard-deleted so nothing is lost.
    // The whole subtree, not only the direct children: deleting a sector takes its blocks and
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

    // Counted, not listed: a sector holds thousands of routes and the card needs one integer.
    // Live rows only, and before the delete stamps them: this is what this deletion takes.
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

    const redirectTo = area.parentFk == null ? resolve('/explore') : entityHref('areas', area.parentFk)

    return { data, redirectTo }
  },
)

/** Undo a {@link deleteArea}: recreate the hard-deleted area (with its parking), or clear
 *  the `deletedAt` the soft delete stamped across the subtree. Either way, the delete event
 *  goes with it so the timeline reads as if it never happened. */
export const restoreArea = authedCommand(restoreAreaSchema, async (snapshot, { db, user, userRegions }) => {
  if (snapshot.mode === 'hard') {
    // The snapshot came from the client, so re-validate its structural placement the way createArea
    // does: otherwise a DELETE holder could restore an area claiming their region but nested under a
    // parent in another region, which that region can neither see nor moderate.
    const { parent: parentArea, status } = await loadParentArea(db, snapshot.area.parentFk, snapshot.area.regionFk)

    if (status === 'missing') {
      error(404, formError('areas_parentNotFound'))
    }
    if (status === 'wrongRegion') {
      error(403, formError('form_noPermission'))
    }
    // A hard restore inserts a brand new row, so it is a create and gates like one. Gating on
    // canDeleteArea instead would deny the undo to the EDITor who has now deleted their own area:
    // the snapshot carries no `createdBy`, so that predicate's own-created branch can never fire.
    if (
      !canAddArea(userRegions, { regionFk: snapshot.area.regionFk, type: null }) ||
      (parentArea != null && !canAddArea(userRegions, parentArea))
    ) {
      error(403, formError('form_noPermission'))
    }

    await requireIssuedId(db, 'areas', snapshot.areaId, formError('areas_notFound'))
    const created = await hardRestoreArea(db, snapshot, user.id)
    if (created == null) {
      const replayed = eq(areas.regionFk, snapshot.area.regionFk)
      return {
        data: { areaId: snapshot.areaId },
        ...(await answerReplayedRestore(db, 'areas', snapshot.areaId, replayed, formError('areas_notFound'))),
      }
    }

    if (created.parentFk != null) await refreshAreaType(db, created.parentFk)
    // Nothing to move onto the new id: only an area inside the grace window is hard-deleted, and
    // `events.area_fk on delete cascade` took its entire log with it.

    return {
      data: { areaId: created.id },
      redirectTo: entityHref('areas', created.id),
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
      redirectTo: entityHref('areas', snapshot.areaId),
    }
  }

  // Refuse rather than strand it: restore the ancestor first, which brings this row with it.
  if (area.parentFk != null && (await hasDeletedAncestor(db, area.parentFk))) {
    error(404, formError('areas_parentNotFound'))
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
    redirectTo: entityHref('areas', snapshot.areaId),
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

/** Add a parking location (a geolocation row) to a sector-type area, optionally with
 *  an approach path (an encoded polyline appended to the area's `geoPaths`). */
export const addParking = authedForm(
  z.object({ areaId: stringToInt, lat: coordinate(90), long: coordinate(180), path: z.optional(z.string()) }),
  async ({ areaId, lat, long, path }, { db, user, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) })

    if (area == null) {
      invalid(formError('areas_notFound'))
    }
    if (!canAddParking(userRegions, area)) {
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

    return { redirectTo: entityHref('areas', areaId) }
  },
)

/** Remove a parking location. Needs delete permission in the parking's region (adding one
 *  takes edit, but removing one is destructive: see canDeleteParking). */
export const deleteParking = authedCommand(z.object({ id: z.number() }), async ({ id }, { db, user, userRegions }) => {
  const parking = await db.query.geolocations.findFirst({ where: eq(geolocations.id, id) })

  // Guard against deleting a block's location through this route: only an
  // area-attached geolocation (areaFk set) is a parking.
  if (parking == null || parking.areaFk == null) {
    error(404, formError('parking_notFound'))
  }

  if (!canDeleteParking(userRegions, parking)) {
    error(403, formError('form_noPermission'))
  }

  // Both halves of the pair refuse on a cleared area, or this succeeds and its Undo cannot.
  const parentArea = await db.query.areas.findFirst({
    columns: { deletedAt: true },
    where: eq(areas.id, parking.areaFk),
  })
  if (parentArea == null || parentArea.deletedAt != null) {
    error(404, formError('areas_notFound'))
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
      return true // keep malformed entries: they aren't this parking's path
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
    redirectTo: entityHref('areas', parking.areaFk),
  }
})

/** Undo a {@link deleteParking}: recreate the parking from the snapshot the delete returned. */
export const restoreParking = authedCommand(
  z.object({ areaId: z.number(), lat: boundedDegrees(90), long: boundedDegrees(180), path: z.optional(z.string()) }),
  async ({ areaId, lat, long, path }, { db, userRegions }) => {
    const area = await db.query.areas.findFirst({ where: and(eq(areas.id, areaId), isNull(areas.deletedAt)) })

    if (area == null) {
      error(404, formError('areas_notFound'))
    }
    if (!canAddParking(userRegions, area)) {
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
