import { userAscentList } from '$lib/entities/ascent/resources.svelte'
import { userFavoriteList } from '$lib/entities/favorite/resources.svelte'
import { routeList } from '$lib/entities/route/resources.svelte'
import type { ResourceStatus } from '$lib/zero/resource.svelte'
import { SvelteSet } from 'svelte/reactivity'
import type { ParsedRouteFilter } from './filter'

/**
 * Routes matching the current filter. Combines the server-side `listRoutes`
 * query with the ascent-status and favorites filters, which Zero can't express
 * (`not(exists())` / polymorphic favorites) and so run client-side against the
 * signed-in user's ascents and favorited routes.
 *
 * @param filter reactive getter for the parsed URL filter.
 * @param userId reactive getter for the signed-in user's id.
 */
export function filteredRouteList(filter: () => ParsedRouteFilter, userId: () => number | undefined) {
  const routes = routeList(() => filter().filter)

  // The user's ascents/favorites only sync while their respective filter is on.
  const userAscents = userAscentList(userId, () => filter().ascentStatus != null)
  const userFavorites = userFavoriteList(userId, () => filter().favoritesOnly)

  const favoriteRouteIds = $derived(new SvelteSet(userFavorites.data.map((favorite) => favorite.routeId)))

  const ascentRouteIds = $derived.by(() => {
    const sent = new SvelteSet<number>()
    const attempted = new SvelteSet<number>()
    for (const ascent of userAscents.data) {
      if (ascent.type === 'attempt') {
        attempted.add(ascent.routeFk)
      } else {
        sent.add(ascent.routeFk)
      }
    }
    return { sent, attempted }
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
    get status(): ResourceStatus {
      return routes.status
    },
  }
}
