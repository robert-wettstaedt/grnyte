import { exit } from '$lib/state/navigation.svelte'

/**
 * The envelope a write resolves to, from an `authedCommand` or from `write()`, for
 * {@link runCommand}. A handler answers `data` only; `redirectTo` is set by the client's `writes.ts`.
 */
export interface MutationResult<T = void> {
  /** Payload handed back to the caller: e.g. an undo snapshot, or a command's result. */
  data?: T
  /** Where the client navigates once the command succeeds. */
  redirectTo?: string
}

/**
 * Invoke a command, apply its {@link MutationResult} envelope (navigate on `redirectTo`),
 * and return its `data` for the caller to act on (e.g. `withUndo` for an undo toast).
 *
 * `beforeRedirect` runs after the command resolves but before navigating: use it to wait
 * for the client store to reflect the write (Zero syncs server writes asynchronously), so
 * the destination renders the row instead of flashing a stale "not found".
 */
export async function runCommand<T>(
  pending: Promise<MutationResult<T> | void>,
  opts?: { beforeRedirect?: (data: T | undefined) => unknown },
): Promise<T | undefined> {
  const result = await pending

  await opts?.beforeRedirect?.(result?.data)

  if (result?.redirectTo != null) {
    // `exit`, not a goto: a command that takes the reader off a screen (a delete, most often) must
    // not leave that screen behind for the back button to return to.
    await exit(result.redirectTo)
  }

  return result?.data
}
