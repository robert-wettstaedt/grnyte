import type { SubmitOutcome } from '$lib/forms/store.svelte'
import { m } from '$lib/paraglide/messages'
import { FAILURE_TOAST_MS, toaster } from '$lib/state/toast/toast'

/** Tells of a failed submit inside a sheet. A toast for offline, since the full-screen tile or the error
 *  boundary would replace the editor and take the unsaved lines. */
export function showSubmitFailure(element: HTMLFormElement, kind: SubmitOutcome<unknown>['kind']): void {
  if (kind === 'offline') {
    toaster.create({ duration: FAILURE_TOAST_MS, title: m.error_offline_title(), type: 'warning' })
  } else {
    element.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center' })
  }
}
