import { goto } from '$app/navigation'

/**
 * The envelope every `authedCommand` / `authedForm` handler resolves to — one reusable
 * contract for all mutations, instead of each inventing its own shape. Commands feed the
 * result to {@link runCommand}; forms `redirect(303)` on `redirectTo` server-side.
 *
 * Precedent for new handlers: return `{ redirectTo }` to navigate, `{ data }` to hand
 * something back (e.g. an undo snapshot for a `restore*` command, or a toggle's new
 * state), or both.
 */
export interface MutationResult<T = void> {
  /** Where the client navigates once the command succeeds. */
  redirectTo?: string
  /** Payload handed back to the caller — e.g. an undo snapshot, or a command's result. */
  data?: T
}

/**
 * Invoke a command, apply its {@link MutationResult} envelope (navigate on `redirectTo`),
 * and return its `data` for the caller to act on (e.g. `withUndo` for an undo toast).
 *
 * `beforeRedirect` runs after the command resolves but before navigating — use it to wait
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
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(result.redirectTo)
  }

  return result?.data
}
