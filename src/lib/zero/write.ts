import type { MutationResult } from '$lib/remote/mutation'
import { isOnline } from '$lib/state/online.svelte'
import { answered, offlineRejection, refusal, type WriteOptions } from './writeResult'
import { getZ } from './z.svelte'

type Mutation = Parameters<ReturnType<typeof getZ>['mutate']>[0]

/** Zero keeps no write id for a retry, so there is nothing to forget (see `write.powersync.ts`). */
export function forgetUnanswered(): void {}

/**
 * Runs a mutation and answers like a remote command: its `data` on success, a {@link WriteRejection}
 * with our message on a refusal, the offline message when Zero could not take it. Refused before
 * it is applied while offline: Zero rejects or holds writes off the connection.
 */
export async function write<T = void>(mutation: Mutation, opts?: WriteOptions<T>): Promise<MutationResult<T>> {
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
    throw refusal(result.error.message, field)
  }

  return answered(result.data as T, opts)
}
