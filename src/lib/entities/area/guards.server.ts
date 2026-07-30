/**
 * The database-backed authorization for area mutations, split out of `areas.remote.ts` so it can be
 * imported from a test (a `.remote.ts` module pulls in SvelteKit's client runtime and cannot).
 *
 * `requireEditableArea` gates on the STORED row, so a submitted `regionFk` can never be the subject
 * of the permission check - the cross-region escalation `updateArea` once allowed.
 */
import * as schema from '$lib/db/schema'
import { areas, type Area } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'
import { formError } from '$lib/forms/schemas'
import { requireRowForm } from '$lib/remote/require.server'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { canEditArea } from './permissions'

type Db = PostgresJsDatabase<typeof schema>

/**
 * Load a would-be child's parent and say where it sits relative to `regionFk`. A child must live in
 * its parent's region: createArea enforces this on create, and restoreArea re-checks it because the
 * undo snapshot is client-supplied - otherwise an area could be nested under a parent in a region
 * that can neither see nor moderate it. Returns the parent row (for the caller's own permission
 * check) and a status the caller maps to its own error shape (`invalid` for a form, `error` for a
 * command). `ok` with no parent when `parentFk` is null (a top-level area).
 */
export async function loadParentArea(
  db: Db,
  parentFk: null | number | undefined,
  regionFk: number,
): Promise<{ parent: Area | undefined; status: 'missing' | 'ok' | 'wrongRegion' }> {
  if (parentFk == null) {
    return { parent: undefined, status: 'ok' }
  }
  const parent = await db.query.areas.findFirst({ where: eq(areas.id, parentFk) })
  if (parent == null) {
    return { parent: undefined, status: 'missing' }
  }
  return { parent, status: parent.regionFk === regionFk ? 'ok' : 'wrongRegion' }
}

/** Load an area for editing; `invalid` on a missing row, a null id, or an edit the caller may not make. */
export function requireEditableArea(db: Db, userRegions: UserRegion[], id: number | undefined) {
  return requireRowForm(
    () => (id == null ? Promise.resolve(undefined) : db.query.areas.findFirst({ where: eq(areas.id, id) })),
    (row) => canEditArea(userRegions, row),
    formError('area_parentNotFound'),
  )
}
