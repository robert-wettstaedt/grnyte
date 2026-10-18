import { resolve } from '$app/paths'
import { areas, blocks, files, geolocations, routes, type Area } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import { type Context } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { answerReplayedRestore, requireIssuedId, requireRow } from '$lib/remote/require.server'
import { error } from '@sveltejs/kit'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { canHardDelete, deleteEvent, insertEvent } from '../event/event.server'
import { stringifyDeletionScale } from '../event/metadata'
import { hasDeletedAncestor, refreshAreaType, stampDeletedAt } from './area.server'
import { restoreAreaSchema, type DeleteAreaSnapshot } from './dto'
import { loadParentArea } from './guards.server'
import { canAddArea, canDeleteArea } from './permissions'

type Caller = Pick<Context, 'db' | 'user' | 'userRegions'>

/** What `restoreArea` receives: the parsed snapshot, whose optional/nullable area fields
 *  differ from {@link DeleteAreaSnapshot}, so the restore helpers key off this. */
type RestoreAreaSnapshot = z.infer<typeof restoreAreaSchema>

/** Collect `rootId` and every area transitively nested beneath it (via `parentFk`).
 *  Cycle-safe; a level-by-level loop is plenty for the shallow area trees we have. */
export async function collectAreaSubtreeIds(db: Context['db'], rootId: number): Promise<number[]> {
  const ids = [rootId]
  let frontier = [rootId]

  while (frontier.length > 0) {
    const children = await db.query.areas.findMany({ columns: { id: true }, where: inArray(areas.parentFk, frontier) })
    frontier = children.map((child) => child.id).filter((id) => !ids.includes(id))
    ids.push(...frontier)
  }

  return ids
}

/** Delete an area. A leaf area (no sub-areas, blocks or files) is hard-deleted; anything
 *  with descendants is soft-deleted across the whole subtree. Answers the snapshot
 *  {@link restoreAreaRow} needs to undo either path. */
export async function deleteAreaRow(
  { id }: { id: number },
  { db, user, userRegions }: Caller,
): Promise<MutationResult<DeleteAreaSnapshot>> {
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
}

/** Hard-delete a leaf area. Its parking geolocations FK-block the row delete, so remove them
 *  first and snapshot them for undo; the area's own fields recreate it. */
export async function hardDeleteArea(db: Context['db'], area: Area): Promise<DeleteAreaSnapshot> {
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

/** Recreate a hard-deleted area under its original id, with its parking. Returns the new row (its
 *  `parentFk` drives the parent's type refresh), or undefined when a replayed Undo finds the id taken. */
export async function hardRestoreArea(
  db: Context['db'],
  snapshot: Extract<RestoreAreaSnapshot, { mode: 'hard' }>,
  createdBy: number,
): Promise<Area | undefined> {
  // The snapshot is client-supplied, so `createdBy` is the caller and `type` is forced to null
  // rather than trusted: the gate asks `canAddArea` with `type: null`, which refuses 'sector', so a
  // snapshot naming 'sector' used to mint through undo a row that create would have rejected and
  // `canAddParking` accepts. `refreshAreaType` owns that column anyway.
  const [created] = await db
    .insert(areas)
    .values({
      createdBy,
      description: snapshot.area.description,
      geoPaths: snapshot.area.geoPaths,
      id: snapshot.areaId,
      name: snapshot.area.name,
      parentFk: snapshot.area.parentFk,
      regionFk: snapshot.area.regionFk,
      type: null,
      walkingPaths: snapshot.area.walkingPaths,
    })
    .onConflictDoNothing({ target: areas.id })
    .returning()

  if (created != null && snapshot.parking.length > 0) {
    await db
      .insert(geolocations)
      .values(snapshot.parking.map(({ lat, long }) => ({ areaFk: created.id, lat, long, regionFk: created.regionFk })))
  }

  return created
}

/** Undo a {@link deleteAreaRow}: recreate the hard-deleted area (with its parking), or clear the
 *  `deletedAt` the soft delete stamped across the subtree, and the delete event with it. */
export async function restoreAreaRow(
  snapshot: z.infer<typeof restoreAreaSchema>,
  { db, user, userRegions }: Caller,
): Promise<MutationResult<{ areaId: number }>> {
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
}

/** Soft-delete an area with descendants: stamp one `deletedAt` across the subtree (area +
 *  descendant areas, their blocks, those blocks' routes). The shared timestamp is the restore
 *  key. Only touch rows not already deleted, so restore won't resurrect independently-deleted
 *  ones. The caller walked the subtree to decide hard-vs-soft and hands the ids over, so the
 *  walk does not happen twice. ponytail: timestamp as restore key; sub-ms collision with a
 *  concurrent delete is the ceiling. Upgrade = a dedicated deletion-batch id column. */
export async function softDeleteArea(
  db: Context['db'],
  area: Area,
  areaIds: number[],
  blockIds: number[],
): Promise<DeleteAreaSnapshot> {
  await stampDeletedAt(db, { areaIds, blockIds }, new Date(), null)

  return { areaId: area.id, mode: 'soft' }
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
export async function softRestoreArea(db: Context['db'], area: Area): Promise<void> {
  if (area.deletedAt == null) {
    return
  }

  const areaIds = await collectAreaSubtreeIds(db, area.id)
  const blockRows = await db.query.blocks.findMany({ columns: { id: true }, where: inArray(blocks.areaFk, areaIds) })
  const blockIds = blockRows.map((row) => row.id)

  await stampDeletedAt(db, { areaIds, blockIds }, null, area.deletedAt)
}
