import type { HumanReadable, QueryOrQueryRequest, ReadonlyJSONValue } from '@rocicorp/zero'
import { getZ } from './z.svelte'
import type { Schema } from './zero-schema'

/** Resolves once the local store holds a row satisfying `isReady`, or after `timeoutMs`: a server write reaches Zero
 *  only after replication, and navigating to a restored entity before that flashes "not found". */
export function waitForRow<
  TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TReturn,
  TContext,
>(
  query: QueryOrQueryRequest<TTable, TInput, TOutput, Schema, TReturn, TContext>,
  isReady: (data: HumanReadable<TReturn>) => boolean,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve) => {
    const view = getZ().materialize(query)
    const finish = () => {
      clearTimeout(timer)
      view.destroy()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    // The listener hands back a deep-readonly view; `isReady` only inspects it.
    view.addListener((data) => {
      if (isReady(data as HumanReadable<TReturn>)) finish()
    })
  })
}
