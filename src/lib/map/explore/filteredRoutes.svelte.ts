/* eslint-disable svelte/prefer-svelte-reactivity -- the sets are rebuilt wholesale inside
   $derived (the new reference is the reactivity) and never mutated afterwards. */
import { userAscentList } from '$lib/entities/ascent/resources.svelte'
import { userFavoriteList } from '$lib/entities/favorite/resources.svelte'
import { isOnline } from '$lib/state/online.svelte'
import type { QueryPhase, QueryResource } from '$lib/zero/resource.svelte'
import type { ParsedRouteFilter } from './filter'

/**
 * Routes matching the current filter. Combines a server-side route query with
 * the ascent-status and favorites filters, which Zero can't express
 * (`not(exists())` / polymorphic favorites) and so run client-side against the
 * signed-in user's ascents and favorited routes.
 *
 * @param routes the server-filtered route resource: `routeMapList` (slim rows,
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

  // The client-side filters read the user's ascents and favorites, so the result is only whole once
  // those are too.
  const settled = $derived(
    routes.phase.kind === 'answered' &&
      (filter().ascentStatus == null || userAscents.phase.kind === 'answered') &&
      (!filter().favoritesOnly || userFavorites.phase.kind === 'answered'),
  )

  return {
    get data() {
      return data
    },
    // The routes' own phase, held back from `answered` until the lists the filters read are too.
    // Empty reflects the *filtered* result, so filters removing every route still show the empty state.
    get phase(): QueryPhase {
      const base = routes.phase
      if (base.kind !== 'answered' && base.kind !== 'arriving' && base.kind !== 'partial') {
        return base
      }
      if (settled || (base.kind === 'answered' && base.empty)) {
        return { empty: data.length === 0, kind: 'answered' }
      }
      return isOnline() ? { kind: 'arriving' } : { kind: 'partial' }
    },
  }
}
