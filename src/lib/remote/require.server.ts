import { APP_PERMISSION_ADMIN } from '$lib/auth'
import { formError, type FormMessage } from '$lib/forms/schemas'
import { error, invalid } from '@sveltejs/kit'

/**
 * The app-admin gate, for the handful of handlers RLS cannot express: there is no region to hang a
 * policy on, so they read through the privileged client and this check is the only thing in front
 * of it. Not defence in depth, the gate. Takes the permissions rather than reading the request, so
 * a caller that already resolved them (`authedRls`) does not resolve them twice.
 */
export function requireAppAdmin(userPermissions: App.Permission[] | undefined): void {
  if (!userPermissions?.includes(APP_PERMISSION_ADMIN)) {
    error(403, formError('form_noPermission'))
  }
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
