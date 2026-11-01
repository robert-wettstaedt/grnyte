import type { ResultType, TTL } from '@rocicorp/zero'
import { addContextToQuery, asQueryInternals } from '@rocicorp/zero/bindings'
import { createSubscriber } from 'svelte/reactivity'
import type { QuerySource } from './resource.svelte'
import { getZ } from './z.svelte'

/** What the source needs from the zero-svelte client: Zero itself, whose `materialize` takes a TTL. */
export type TtlClient = Pick<ReturnType<typeof getZ>, 'context' | 'current'>

/**
 * A query source that materializes through Zero itself with `ttl`, for queries that should stop
 * syncing as soon as nothing reads them (a search term the reader has moved past). zero-svelte's
 * `createQuery` takes no options, so every query it builds keeps Zero's default 5 minute TTL.
 */
export function ttlSource(ttl: TTL, client: () => TtlClient = getZ): QuerySource {
  return {
    createQuery(request, enabled) {
      const z = client()
      const query = addContextToQuery(request, z.context)
      let data = $state.raw<unknown>(asQueryInternals(query).format.singular ? undefined : [])
      let type = $state<ResultType>('unknown')
      // Materialized while something reads it, destroyed when the last reader goes.
      const ensureSubscribed = createSubscriber(() => {
        if (!enabled) return
        const view = z.current.materialize(query, { ttl })
        const stop = view.addListener((rows, resultType) => {
          data = rows
          type = resultType
        })
        return () => {
          stop()
          view.destroy()
        }
      })
      return {
        get data() {
          return data
        },
        get details() {
          // `cached` is rows from the device the server has not confirmed yet, which zero-svelte reports as is.
          return { type } as { type: 'complete' | 'error' | 'unknown' }
        },
        view: { ensureSubscribed },
      }
    },
  }
}
