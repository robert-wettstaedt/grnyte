import { areas, blocks, geolocations, type Area } from '$lib/db/schema'
import { boundedDegrees } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { type Context } from '$lib/remote/authed.server'
import { eq, inArray } from 'drizzle-orm'
import { stampDeletedAt } from './area.server'

/** Snapshot `deleteArea` returns so `restoreArea` can undo either delete path. */
export type DeleteAreaSnapshot =
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

export const restoreAreaSchema = z.discriminatedUnion('mode', [
  z.object({
    area: z.object({
      description: z.optional(z.nullable(z.string())),
      geoPaths: z.optional(z.nullable(z.array(z.string()))),
      name: z.string(),
      parentFk: z.optional(z.nullable(z.number())),
      regionFk: z.number(),
      walkingPaths: z.optional(z.nullable(z.array(z.string()))),
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

/** What `restoreArea` receives: the parsed snapshot, whose optional/nullable area fields
 *  differ from {@link DeleteAreaSnapshot}, so the restore helpers key off this. */
type RestoreAreaSnapshot = z.infer<typeof restoreAreaSchema>

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
