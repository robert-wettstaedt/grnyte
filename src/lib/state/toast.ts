import { resolveErrorMessage, serverMessage } from '$lib/forms/issue'
import { reportIfOnline } from '$lib/logging/report'
import { m } from '$lib/paraglide/messages'
import { runCommand, type MutationResult } from '$lib/remote/mutation'
import { createToaster } from '@skeletonlabs/skeleton-svelte'

const store = createToaster({
  gap: 8,
  max: 3,
  // Lift the snackbar off the home indicator / sheet edge so it reads as floating.
  offsets: { bottom: 'calc(env(safe-area-inset-bottom) + 1rem)', left: '1rem', right: '1rem', top: '1rem' },
  placement: 'bottom',
})

/**
 * App-wide toaster. Mounted once by `<Toaster>` in the (app) layout (and by `/f/[id]`, which
 * renders outside it), so toasts survive client-side navigation: the undo snackbar outlives the
 * route change a delete triggers.
 *
 * The wrapped `subscribe` is load-bearing, not indirection to tidy away. `<Toast.Group>` keeps its
 * toast list in a `sync: true` bindable, so writing it runs `flushSync`: a toast raised from a
 * running `$effect` re-enters the flush, and if that effect had already written one of its OWN
 * dependencies, the re-run leaves it with fewer deps than the suspended outer frame is about to
 * walk. Svelte then throws `undefined is not an object (evaluating 'deps[i].rv = ...')` out of
 * `update_reaction`, the (app) error boundary swallows the screen, and the reader loses the form
 * they were filling in. It shipped that way in BlockForm's locate failure.
 *
 * Deferring here rather than at the call sites is the point: `create` is one of fourteen methods
 * that publish (`success`, `dismiss`, `update`, …), and the group itself calls `remove`/`pause`/
 * `expand` from its own actions, none of which a call-site rule reaches. The group's mount-time
 * seed (`context.set('toasts', getVisibleToasts())`) stays synchronous and is fine: the crash needs
 * a suspended effect that has written its own deps, which a mounting layout has not.
 *
 * `toast.effect.test.ts` is the enforcement and goes red the moment the deferral is removed.
 * Reordering the raising effect's own statements also "fixes" it, and stops holding the next time
 * somebody adds a read, so don't rely on that. Popover is the other zag machine here that reaches
 * `flushSync` (`invokeOnOpen`/`invokeOnClose`), though no `Modal` is opened today from an effect
 * that writes its own deps, which is the shape that makes it fatal.
 */
export const toaster: typeof store = {
  ...store,
  subscribe: (callback) => {
    // `live`, because unsubscribing cannot cancel an already-queued microtask.
    let live = true
    const unsubscribe = store.subscribe((...args) => queueMicrotask(() => live && callback(...args)))

    return () => {
      live = false
      unsubscribe()
    }
  },
}

/** How long a failure stays up, longer than a confirmation the reader was already expecting. */
export const FAILURE_TOAST_MS = 8000

export interface UndoToastData {
  duration?: number
  message: string
  onUndo: () => unknown
}

/**
 * Toast a failed action, the one thing every `catch` in the app does, so it lives here
 * instead of being spelled out at each call site. {@link resolveErrorMessage} resolves a
 * server-sent message key and falls back to the generic copy, which makes this correct for
 * a bare `catch {}` (no cause) too.
 */
export function notifyError(cause?: unknown): void {
  // Only the ones nobody can explain afterwards. A server-authored message means the app said no
  // on purpose, and offline it was the network, not a defect.
  if (serverMessage(cause) == null) {
    reportIfOnline(cause)
  }

  toaster.create({ duration: FAILURE_TOAST_MS, title: resolveErrorMessage(cause), type: 'error' })
}

/** `sendEmail` returns a delivery boolean rather than throwing, so "saved but not sent" is a warning, not an error. */
export function notifySend(sent: boolean, sentTitle: string, notSentTitle: string): void {
  toaster.create({ title: sent ? sentTitle : notSentTitle, type: sent ? 'success' : 'warning' })
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
    action: {
      label: m.common_undo(),
      // The restore can fail too. Async wrapper, so a synchronous throw is caught as well.
      onClick: () =>
        void (async () => {
          try {
            await opts.onUndo()
          } catch (cause) {
            notifyError(cause)
          }
        })(),
    },
    duration: opts.duration ?? Number.POSITIVE_INFINITY,
    title: opts.message,
    type: 'info',
  })
}

/**
 * Run a reversible command and offer Undo: the standard pattern for cheap, low-stakes
 * destructive actions (deleting a parking, a block, …). Applies the command's envelope
 * via {@link runCommand} (navigating on `redirectTo`), then, if it returned an undo
 * snapshot, shows the snackbar wired to `onUndo(snapshot)`.
 *
 * Reusable precedent for other entities:
 *   1. `delete<Entity>()` deletes and returns the snapshot to recreate from (the envelope's `data`).
 *   2. `withUndo(delete<Entity>(…), { message, onUndo: restore<Entity> })`.
 *   3. `restore<Entity>()` recreates the row and removes the event the delete logged.
 *
 * `waitFor` defers the restore's redirect until the recreated row has synced into the
 * local store (Zero lags server writes): pass the entity's `waitFor*` helper so the
 * destination renders the row instead of flashing "not found". Omit it when the restore
 * doesn't navigate (e.g. `restoreParking`).
 */
export async function withUndo<T, U>(
  pending: Promise<MutationResult<T> | void>,
  opts: {
    duration?: number
    message: string
    onUndo: (snapshot: T) => Promise<MutationResult<U> | void>
    waitFor?: (data: U) => unknown
  },
): Promise<void> {
  let snapshot: T | undefined
  try {
    snapshot = await runCommand(pending)
  } catch (cause) {
    // Reported here rather than at the call sites, and swallowed: a failed delete has nothing
    // left to undo, so saying so is the whole reaction.
    notifyError(cause)
    return
  }

  if (snapshot != null) {
    // Run the undo through `runCommand` too, so a restore that returns `redirectTo` navigates.
    notifyUndo({
      duration: opts.duration,
      message: opts.message,
      onUndo: () =>
        runCommand(opts.onUndo(snapshot), {
          beforeRedirect: (data) => (data == null ? undefined : opts.waitFor?.(data)),
        }),
    })
  }
}
