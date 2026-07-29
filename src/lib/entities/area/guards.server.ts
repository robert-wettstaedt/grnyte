/**
 * The database-backed authorization for area mutations, split out of `areas.remote.ts` so it can be
 * imported from a test (a `.remote.ts` module pulls in SvelteKit's client runtime and cannot).
 *
 * `requireEditableArea` gates on the STORED row, so a submitted `regionFk` can never be the subject
 * of the permission check - the cross-region escalation `updateArea` once allowed.
 */
import * as schema from '$lib/db/schema'
import { areas } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'
import { formError } from '$lib/forms/schemas'
import { requireRowForm } from '$lib/remote/require.server'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { canEditArea } from './permissions'

type Db = PostgresJsDatabase<typeof schema>

/** Load an area for editing; `invalid` on a missing row, a null id, or an edit the caller may not make. */
export function requireEditableArea(db: Db, userRegions: UserRegion[], id: number | undefined) {
  return requireRowForm(
    () => (id == null ? Promise.resolve(undefined) : db.query.areas.findFirst({ where: eq(areas.id, id) })),
    (row) => canEditArea(userRegions, row),
    formError('area_parentNotFound'),
  )
}
