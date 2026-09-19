import { isOnline } from '$lib/state/online.svelte'
import type { Availability, QueryResource, ResourceStatus } from '$lib/zero/resource.svelte'
import type { RemoteQuery } from '@sveltejs/kit'

/**
 * Presents a SvelteKit remote query as the shape `QueryState` renders, so a server-only screen gets
 * the same skeleton, empty, error and offline branches as every Zero-backed list.
 */
export function remoteResource<T>(query: RemoteQuery<T>): QueryResource<T | undefined> {
  // Kit reports `loading` during a refresh too, so only a query that has never answered is loading.
  // A refresh keeps the rows on screen instead of replacing them with the skeleton.
  const status = (): ResourceStatus => {
    if (query.error != null) {
      return 'error'
    }

    return query.loading && !query.ready ? 'loading' : 'ready'
  }

  return {
    get availability(): Availability {
      // Offline before the first answer is the case this earns: no round trip is coming, so an error
      // card would be the wrong claim. Once an answer is in hand it stays, it was a whole response.
      return !query.ready && !isOnline() ? 'excluded' : status()
    },

    get data(): T | undefined {
      return query.current
    },

    // A whole answer is in hand, which a refresh does not undo and an error never reaches.
    get isComplete(): boolean {
      return query.ready && query.error == null
    },

    get isEmpty(): boolean {
      const data = query.current
      return status() === 'ready' && (data === undefined || (Array.isArray(data) && data.length === 0))
    },

    get isSyncing(): boolean {
      return query.loading
    },

    get status(): ResourceStatus {
      return status()
    },
  }
}
