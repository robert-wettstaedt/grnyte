/* eslint-disable svelte/prefer-svelte-reactivity -- the sets are rebuilt wholesale inside
   $derived (the new reference is the reactivity) and never mutated afterwards. */
import { userAscentList } from '$lib/entities/ascent/resources.svelte'
import { userFavoriteList } from '$lib/entities/favorite/resources.svelte'
import type { QueryResource } from '$lib/zero/resource.svelte'
import type { ParsedRouteFilter } from './filter'

/**
 * Routes matching the current filter. Combines a server-side route query with
 * the ascent-status and favorites filters, which Zero can't express
 * (`not(exists())` / polymorphic favorites) and so run client-side against the
 * signed-in user's ascents and favorited routes.
 *
 * @param routes the server-filtered route resource — `routeMapList` (slim rows,
 *   the map) or `routeList` (full list items, the area routes sheet).
 * @param filter reactive getter for the parsed URL filter.
 * @param userId reactive getter for the signed-in user's id.
 */
export function filteredRouteList<T extends { id: number }>(
  routes: QueryResource<T[]>,
  filter: () => ParsedRouteFilter,
  userId: () => number | undefined,
): QueryResource<T[]> {
  // The user's ascents/favorites only sync while their respective filter is on.
  const userAscents = userAscentList(userId, () => filter().ascentStatus != null)
  const userFavorites = userFavoriteList(userId, () => filter().favoritesOnly)

  const favoriteRouteIds = $derived(new Set(userFavorites.data.map((favorite) => favorite.routeId)))

  const ascentRouteIds = $derived.by(() => {
    const sent = new Set<number>()
    const attempted = new Set<number>()
    for (const ascent of userAscents.data) {
      if (ascent.type === 'attempt') {
        attempted.add(ascent.routeFk)
      } else {
        sent.add(ascent.routeFk)
      }
    }
    return { attempted, sent }
  })

  const data = $derived.by(() => {
    let result = routes.data

    switch (filter().ascentStatus) {
      case 'done':
        result = result.filter((route) => ascentRouteIds.sent.has(route.id))
        break
      case 'todo':
        result = result.filter((route) => !ascentRouteIds.sent.has(route.id))
        break
      case 'project':
        result = result.filter((route) => ascentRouteIds.attempted.has(route.id) && !ascentRouteIds.sent.has(route.id))
        break
    }

    if (filter().favoritesOnly) {
      result = result.filter((route) => favoriteRouteIds.has(route.id))
    }

    return result
  })

  return {
    get data() {
      return data
    },
    get isComplete() {
      return routes.isComplete
    },
    // Empty reflects the *filtered* result, so client-side filters that remove
    // every route still trigger the empty state.
    get isEmpty() {
      return routes.status === 'ready' && data.length === 0
    },
    get isSyncing() {
      return routes.isSyncing
    },
    get status() {
      return routes.status
    },
  }
}
