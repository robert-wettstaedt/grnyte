import { areaList } from '$lib/entities/area/resources.svelte'
import { blockList } from '$lib/entities/block/resources.svelte'
import { SvelteMap } from 'svelte/reactivity'
import type { ParsedRouteFilter } from './filter'
import { filteredRouteList } from './filteredRoutes.svelte'
import type { MapData } from './types'

/**
 * The /explore map dataset — all blocks/areas/parking/paths plus the per-block
 * route & grade counts that feed the donut markers. Shared so the parking
 * picker renders the exact same map as /explore.
 */
export function createExploreMapData(filters: () => ParsedRouteFilter, userId: () => number | undefined) {
  const routes = filteredRouteList(filters, userId)
  const blocksResult = blockList(() => ({}))
  const areasResult = areaList(() => ({}))

  // Each field is its own $derived so it only recomputes when its own source query
  // changes — a parking mutation re-emits only the areas query, so `parkingLocations`
  // and `lineStrings` update while `blocks`/route counts (and the donut markers they
  // feed) keep stable references. That keeps the map's per-layer effects granular: an
  // update touches just the affected layer instead of rebuilding (and flashing) them all.
  const routeCountByBlock = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    for (const route of routes.data) {
      if (route.blockFk != null) counts.set(route.blockFk, (counts.get(route.blockFk) ?? 0) + 1)
    }
    return counts
  })

  const gradeCountByBlock = $derived.by(() => {
    const counts = new SvelteMap<number, SvelteMap<number, number>>()
    for (const route of routes.data) {
      if (route.blockFk == null || route.gradeFk == null) continue
      let byGrade = counts.get(route.blockFk)
      if (byGrade == null) {
        byGrade = new SvelteMap<number, number>()
        counts.set(route.blockFk, byGrade)
      }
      byGrade.set(route.gradeFk, (byGrade.get(route.gradeFk) ?? 0) + 1)
    }
    return counts
  })

  const blocks = $derived(blocksResult.data.filter((block) => routeCountByBlock.has(block.id)))
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
    get parkingLocations() {
      return parkingLocations
    },
    get lineStrings() {
      return lineStrings
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
    get gradeCountByBlock() {
      return gradeCountByBlock
    },
    /** True on cold load while no markers are renderable yet. */
    get isLoading() {
      return isLoading
    },
    /** The underlying route resource, exposed so callers can show filter/loading state. */
    routes,
  } satisfies MapData & { routes: typeof routes }
}
