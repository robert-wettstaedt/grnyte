/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards.
   SvelteMap made the counter loops pathological in dev: Svelte captures an Error stack per
   set once a signal updates >5 times per flush, costing >1s on the initial /explore load. */
import { areaList } from '$lib/entities/area/resources.svelte'
import { blockList } from '$lib/entities/block/resources.svelte'
import { routeMapList } from '$lib/entities/route/resources.svelte'
import { isParsedFilterActive, type ParsedRouteFilter } from './filter'
import { filteredRouteList } from './filteredRoutes.svelte'
import type { MapData } from './types'

/**
 * The /explore map dataset — all blocks/areas/parking/paths plus the per-block
 * route & grade counts that feed the donut markers. Shared so the parking
 * picker renders the exact same map as /explore.
 */
export function createExploreMapData(
  filters: () => ParsedRouteFilter,
  userId: () => number | undefined,
  search: () => string = () => '',
) {
  // Slim rows (no related trees): the map only reads id/blockFk/gradeFk per route.
  const routes = filteredRouteList(
    routeMapList(() => filters().filter),
    filters,
    userId,
  )
  const blocksResult = blockList(() => ({}))
  const areasResult = areaList(() => ({}))

  // Each field is its own $derived so it only recomputes when its own source query
  // changes — a parking mutation re-emits only the areas query, so `parkingLocations`
  // and `lineStrings` update while `blocks`/route counts (and the donut markers they
  // feed) keep stable references. That keeps the map's per-layer effects granular: an
  // update touches just the affected layer instead of rebuilding (and flashing) them all.
  const routeCountByBlock = $derived.by(() => {
    const counts = new Map<number, number>()
    for (const route of routes.data) {
      if (route.blockFk != null) counts.set(route.blockFk, (counts.get(route.blockFk) ?? 0) + 1)
    }
    return counts
  })

  const gradeCountByBlock = $derived.by(() => {
    const counts = new Map<number, Map<number, number>>()
    for (const route of routes.data) {
      if (route.blockFk == null || route.gradeFk == null) continue
      let byGrade = counts.get(route.blockFk)
      if (byGrade == null) {
        byGrade = new Map<number, number>()
        counts.set(route.blockFk, byGrade)
      }
      byGrade.set(route.gradeFk, (byGrade.get(route.gradeFk) ?? 0) + 1)
    }
    return counts
  })

  // Search scope: blocks matching the query by their own name or any ancestor area
  // name (the `areas` chain is already synced, so no extra query). `null` when not
  // searching, so the map stays untouched.
  // ponytail: name/area match only — a bare route-name search shows the route in the
  // list, not on the map; couple `content` into `routeMapList` above if that's wanted.
  const searchBlockIds = $derived.by(() => {
    const needle = search().trim().toLowerCase()
    if (needle.length === 0) return null
    const ids = new Set<number>()
    for (const block of blocksResult.data) {
      if (
        block.name.toLowerCase().includes(needle) ||
        block.areas.some((area) => area.name.toLowerCase().includes(needle))
      ) {
        ids.add(block.id)
      }
    }
    return ids
  })

  // Search narrows to name/area matches; a route filter then narrows those to blocks
  // holding matching routes (so search + filter compose). Without either, every block
  // shows — a just-created block has no routes yet, but must still appear. The
  // untouched path returns the source array by reference so the map layer doesn't flash.
  const blocks = $derived.by(() => {
    const searchIds = searchBlockIds
    let result = searchIds == null ? blocksResult.data : blocksResult.data.filter((block) => searchIds.has(block.id))
    if (isParsedFilterActive(filters())) {
      result = result.filter((block) => routeCountByBlock.has(block.id))
    }
    return result
  })
  const parkingLocations = $derived(areasResult.data.flatMap((area) => area.parkingLocations))
  const lineStrings = $derived(areasResult.data.flatMap((area) => area.geoPaths))

  // True only while nothing is renderable yet — local-first preloads flip the
  // source queries to `ready` fast, so this is the cold-load case (no markers).
  const isLoading = $derived(
    routes.status === 'loading' || blocksResult.status === 'loading' || areasResult.status === 'loading',
  )

  // A stable object with per-field reactive getters. Callers bind each field to `<Map>`
  // individually (never spread), so a field whose source query didn't change keeps a
  // stable reference and its map layer's effect doesn't re-run — only the changed layer does.
  return {
    get blocks() {
      return blocks
    },
    get gradeCountByBlock() {
      return gradeCountByBlock
    },
    /** True on cold load while no markers are renderable yet. */
    get isLoading() {
      return isLoading
    },
    get lineStrings() {
      return lineStrings
    },
    get parkingLocations() {
      return parkingLocations
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
    /** The underlying route resource, exposed so callers can show filter/loading state. */
    routes,
  } satisfies MapData & { isLoading: boolean; routes: typeof routes }
}
