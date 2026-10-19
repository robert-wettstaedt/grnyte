import { isAuthoredMessage } from '$lib/forms/issue'
import { formError } from '$lib/forms/schemas'
import type { MutationResult } from '$lib/remote/mutation'
import { isOnline } from '$lib/state/online.svelte'
import { getZ } from './z.svelte'

/** What a refused write throws: Kit's `HttpError` shape, so `notifyError` and `withUndo` read it
 *  as they read a rejected remote command, plus the field the refusal concerns. */
export type WriteRejection = { body: { field?: null | string; message: string }; offline?: true }

type Mutation = Parameters<ReturnType<typeof getZ>['mutate']>[0]

/**
 * Runs a mutation and answers like a remote command: its `data` on success, a {@link WriteRejection}
 * with our message on a refusal, the offline message when Zero could not take it. Refused before
 * it is applied while offline: Zero rejects or holds writes off the connection.
 */
export async function write<T = void>(
  mutation: Mutation,
  opts?: { redirectTo?: ((data: T) => string) | string },
): Promise<MutationResult<T>> {
  if (!isOnline()) {
    throw offlineRejection
  }

  const result = await getZ().mutate(mutation).server

  if (result.type === 'error') {
    // A `zero` error is the connection; its text is Zero's, never shown.
    if (result.error.type !== 'app') {
      throw offlineRejection
    }
    const field = (result.error.details as null | undefined | { field?: null | string })?.field
    // The client half can throw too, and its text is a TypeError's, not ours.
    throw rejection(
      isAuthoredMessage(result.error.message) ? result.error.message : formError('error_server_title'),
      field,
    )
  }

  const data = result.data as T
  return { data, redirectTo: typeof opts?.redirectTo === 'function' ? opts.redirectTo(data) : opts?.redirectTo }
}

const rejection = (message: string, field?: null | string): WriteRejection => ({ body: { field, message } })

/** What any write throws when it never reached the server. */
export const offlineRejection: WriteRejection = { ...rejection(formError('error_offline_title')), offline: true }
