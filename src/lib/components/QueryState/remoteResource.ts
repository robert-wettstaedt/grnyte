import { isOnline } from '$lib/state/online.svelte'
import type { QueryPhase, QueryResource } from '$lib/zero/resource.svelte'
import type { RemoteQuery } from '@sveltejs/kit'

/** A SvelteKit remote query as a `QueryResource`, so a server-only screen gets the same branches.
 *  Kit's `ready` is the answer: a refresh in flight does not take it back. */
export function remoteResource<T>(query: RemoteQuery<T>): QueryResource<T | undefined> {
  return {
    get data(): T | undefined {
      return query.current
    },

    get phase(): QueryPhase {
      // Offline before any answer is not an error: nothing kept it, and it cannot come.
      if (!query.ready && !isOnline()) {
        return { excluded: true, kind: 'unavailable' }
      }
      if (query.error != null) {
        return { kind: 'error' }
      }
      if (!query.ready) {
        return { kind: 'loading' }
      }
      const data = query.current
      return { empty: data === undefined || (Array.isArray(data) && data.length === 0), kind: 'answered' }
    },
  }
}
