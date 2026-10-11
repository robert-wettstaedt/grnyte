import { APP_PERMISSION_ADMIN } from '$lib/auth'
import type * as schema from '$lib/db/schema'
import { areas, blocks, routes } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError, type FormMessage } from '$lib/forms/schemas'
import { error, invalid } from '@sveltejs/kit'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * The app-admin gate for the handlers RLS cannot express: they have no region to hang a policy on,
 * so they read through the privileged client and this check is the only thing in front of it.
 * Takes the permissions, so a caller that already resolved them does not resolve them twice.
 */
export function requireAppAdmin(userPermissions: App.Permission[] | undefined): void {
  if (!userPermissions?.includes(APP_PERMISSION_ADMIN)) {
    error(403, formError('form_noPermission'))
  }
}

/**
 * A hard-delete Undo's client-sent id, accepted only if its sequence already issued it (`0135`):
 * an id past the sequence would be taken from every region's future inserts.
 */
export async function requireIssuedId(
  db: PostgresJsDatabase<typeof schema>,
  entity: 'areas' | 'blocks' | 'routes',
  id: number,
  notFound: FormMessage,
): Promise<void> {
  const [row] = await db.execute<{ issued: boolean }>(sql`select public.id_was_issued(${entity}, ${id}) as issued`)
  if (row?.issued !== true) {
    error(404, notFound)
  }
}

const RESTORABLE = { areas, blocks, routes }

/**
 * A hard restore whose insert found its id taken: a replay only if that row sits where this restore
 * put it (`ownedBy`), so the redirect never confirms a stranger's row. 404 otherwise.
 */
export async function answerReplayedRestore(
  db: PostgresJsDatabase<typeof schema>,
  kind: keyof typeof RESTORABLE,
  id: number,
  ownedBy: SQL,
  notFound: FormMessage,
): Promise<{ redirectTo: string }> {
  const table = RESTORABLE[kind]
  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), ownedBy))
    .limit(1)
  if (existing == null) {
    error(404, notFound)
  }
  return { redirectTo: entityHref(kind, id) }
}

/**
 * Load an entity, then gate on it. The permission predicate is handed the FETCHED ROW, so the
 * subject of the check can only ever be stored data, never request input. Passing a request-derived
 * object to a gate (as `updateArea`, `toggleFavorite` and `finalizeImage` each once did, letting a
 * caller name their own region) is not expressible through this seam.
 *
 * For `command` / `authedCommand` handlers: 404 then 403, both via `error`. See {@link requireRowForm}
 * for the `form` variant, which reports through `invalid` instead.
 *
 * `notFound` is a {@link FormMessage}, so it has to be a wrapped key, not a raw literal.
 *
 *     const block = await requireRow(
 *       () => db.query.blocks.findFirst({ where: eq(blocks.id, id) }),
 *       (row) => canDeleteBlock(userRegions, user.id, row),
 *       formError('blocks_notFound'),
 *     )
 */
export async function requireRow<T>(
  load: () => Promise<T | undefined>,
  allow: (row: T) => boolean,
  notFound: FormMessage,
): Promise<T> {
  const row = await load()
  if (row == null) {
    error(404, notFound)
  }
  if (!allow(row)) {
    error(403, formError('form_noPermission'))
  }
  return row
}

/**
 * {@link requireRow} for `form` / `authedForm` handlers: reports a missing row and a failed gate
 * through `invalid` rather than `error`, so they surface as form issues. `notFound` is a
 * pre-encoded message (wrap the key with `formError(...)`, as every other `invalid` call does).
 */
export async function requireRowForm<T>(
  load: () => Promise<T | undefined>,
  allow: (row: T) => boolean,
  notFound: FormMessage,
): Promise<T> {
  const row = await load()
  if (row == null) {
    invalid(notFound)
  }
  if (!allow(row)) {
    invalid(formError('form_noPermission'))
  }
  return row
}
