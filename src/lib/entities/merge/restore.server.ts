import { formError } from '$lib/forms/schemas'
import { error } from '@sveltejs/kit'

/** A merged source never comes back. Asked before the write, so the refusal reads as one rather than
 *  as the `*_merged_is_deleted` constraint that would stop it anyway. */
export function refuseMerged(row: { mergedInto: null | number }): void {
  if (row.mergedInto != null) error(409, formError('merges_restoreRefused'))
}
