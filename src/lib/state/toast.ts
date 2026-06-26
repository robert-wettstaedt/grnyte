import { m } from '$lib/paraglide/messages'
import { runCommand, type MutationResult } from '$lib/remote/mutation'
import { createToaster } from '@skeletonlabs/skeleton-svelte'

/** App-wide toaster. Mounted once by `<Toaster>` in the (app) layout, so toasts
 *  survive client-side navigation (the undo snackbar outlives the route change a
 *  delete triggers). Import {@link toaster} anywhere to raise a toast. */
export const toaster = createToaster({
  placement: 'bottom',
  max: 3,
  gap: 8,
  // Lift the snackbar off the home indicator / sheet edge so it reads as floating.
  offsets: { top: '1rem', right: '1rem', left: '1rem', bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' },
})

export interface UndoToastData {
  message: string
  onUndo: () => unknown
  duration?: number
}

/**
 * Low-level "<message> · Undo" snackbar. Prefer {@link withUndo} for the command +
 * undo flow; reach for this directly only when the undo isn't a remote command.
 *
 * The duration is generous on purpose: the action usually navigates away, so the
 * user needs time to spot the snackbar on the destination screen and catch a mis-tap.
 */
export function notifyUndo(opts: UndoToastData): void {
  toaster.create({
    type: 'info',
    title: opts.message,
    duration: opts.duration ?? Number.POSITIVE_INFINITY,
    action: { label: m.common_undo(), onClick: () => void opts.onUndo() },
  })
}

/**
 * Run a reversible command and offer Undo — the standard pattern for cheap, low-stakes
 * destructive actions (deleting a parking, a block, …). Applies the command's envelope
 * via {@link runCommand} (navigating on `redirectTo`), then, if it returned an undo
 * snapshot, shows the snackbar wired to `onUndo(snapshot)`.
 *
 * Reusable precedent for other entities:
 *   1. `delete<Entity>()` deletes and returns the snapshot to recreate from (the envelope's `data`).
 *   2. `withUndo(delete<Entity>(…), { message, onUndo: restore<Entity> })`.
 *   3. `restore<Entity>()` recreates the row and removes the activity the delete logged.
 *
 * `waitFor` defers the restore's redirect until the recreated row has synced into the
 * local store (Zero lags server writes) — pass the entity's `waitFor*` helper so the
 * destination renders the row instead of flashing "not found". Omit it when the restore
 * doesn't navigate (e.g. `restoreParking`).
 */
export async function withUndo<T, U>(
  pending: Promise<MutationResult<T> | void>,
  opts: {
    message: string
    onUndo: (snapshot: T) => Promise<MutationResult<U> | void>
    waitFor?: (data: U) => unknown
    duration?: number
  },
): Promise<void> {
  const snapshot = await runCommand(pending)
  if (snapshot != null) {
    // Run the undo through `runCommand` too, so a restore that returns `redirectTo` navigates.
    notifyUndo({
      message: opts.message,
      duration: opts.duration,
      onUndo: () =>
        runCommand(opts.onUndo(snapshot), {
          beforeRedirect: (data) => (data == null ? undefined : opts.waitFor?.(data)),
        }),
    })
  }
}
