import { isOnline } from '$lib/state/online.svelte'
import { isOfflineFailure } from './offlineFailure'

export type SubmitOutcome = 'offline' | 'rejected' | 'submitted'

/**
 * Run a remote form's submit and say how it went, so each surface can answer a dead network its own
 * way (a full-screen tile, a toast) without repeating the classification.
 *
 * Only the submit itself is ever classified as offline, and structurally so: `onSuccess` runs
 * outside the `try`, because a `TypeError` from it means the send already landed and calling that
 * offline invites a duplicate. Keep it outside; nothing else may enter the `try`.
 */
export async function submitForm(
  submit: () => Promise<boolean>,
  onSuccess?: () => Promise<void> | void,
): Promise<SubmitOutcome> {
  try {
    if (!(await submit())) {
      // Kit only returns false WITH issues, and `FormError` renders the form-level ones, so a caller
      // must not also toast here: every validation error would be reported twice.
      return 'rejected'
    }
  } catch (error) {
    if (isOfflineFailure(error, isOnline())) {
      return 'offline'
    }
    throw error
  }

  await onSuccess?.()
  return 'submitted'
}
