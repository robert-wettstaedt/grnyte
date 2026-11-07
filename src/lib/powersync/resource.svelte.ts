import { isOnline } from '$lib/state/online.svelte'
import { resolvePhase, type QueryPhase, type QueryResource } from '$lib/zero/resource.svelte'
import type { Context, InferResultType, InitialQueryBuilder, QueryBuilder } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/svelte-db'
import { powerSyncStatus } from './db.svelte'

/**
 * A TanStack DB live query as the app's `QueryResource`, so `QueryState` and `summaryOf` read it unchanged.
 * Complete means the collection is ready and the stream that fills it has synced once. Every device holds the
 * whole region, so offline after that first sync is an answer, not an absence.
 */
export function psResource<TContext extends Context, TOut>(
  query: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  deps: (() => unknown)[],
  select: (rows: InferResultType<TContext>) => TOut,
  stream = 'guidebook',
): QueryResource<TOut> {
  const live = useLiveQuery(query, deps) as { data: InferResultType<TContext>; isReady: boolean }
  const synced = $derived(powerSyncStatus()?.forStream({ name: stream, parameters: null })?.subscription.hasSynced)
  const complete = $derived(live.isReady && synced === true)
  const errored = $derived(powerSyncStatus()?.dataFlowStatus.downloadError != null && !complete)
  const data = $derived(select(live.data))

  return {
    get data() {
      return data
    },
    get phase(): QueryPhase {
      const raw = live.data as unknown
      const rawEmpty = raw == null || (Array.isArray(raw) && raw.length === 0)
      return resolvePhase({
        excluded: false,
        online: isOnline(),
        rawEmpty,
        settled: complete,
        status: errored ? 'error' : complete ? 'ready' : 'loading',
      })
    },
  }
}
