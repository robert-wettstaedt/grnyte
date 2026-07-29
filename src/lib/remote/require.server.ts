import { formError } from '$lib/forms/schemas'
import { error, invalid } from '@sveltejs/kit'

/**
 * Load an entity, then gate on it. The permission predicate is handed the FETCHED ROW, so the
 * subject of the check can only ever be stored data - never request input. Passing a request-derived
 * object to a gate (as `updateArea`, `toggleFavorite` and `finalizeImage` each once did, letting a
 * caller name their own region) is not expressible through this seam.
 *
 * For `command` / `authedCommand` handlers: 404 then 403, both via `error`. See {@link requireRowForm}
 * for the `form` variant, which reports through `invalid` instead.
 *
 *     const block = await requireRow(
 *       () => db.query.blocks.findFirst({ where: eq(blocks.id, id) }),
 *       (row) => canDeleteBlock(userRegions, user.id, row),
 *       'Block not found',
 *     )
 */
export async function requireRow<T>(
  load: () => Promise<T | undefined>,
  allow: (row: T) => boolean,
  notFound: string,
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
  notFound: string,
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
