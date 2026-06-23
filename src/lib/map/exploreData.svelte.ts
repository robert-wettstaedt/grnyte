import { areaList } from '$lib/entities/area/resources.svelte'
import { blockList } from '$lib/entities/block/resources.svelte'
import { SvelteMap } from 'svelte/reactivity'
import type { ParsedRouteFilter } from './filter'
import { filteredRouteList } from './filteredRoutes.svelte'
import type { BlocksMapProps } from './types'

/**
 * The /explore map dataset — all blocks/areas/parking/paths plus the per-block
 * route & grade counts that feed the donut markers. Shared so the parking
 * picker renders the exact same map as /explore.
 */
export function createExploreMapData(filters: () => ParsedRouteFilter, userId: () => number | undefined) {
  const routes = filteredRouteList(filters, userId)
  const blocksResult = blockList(() => ({}))
  const areasResult = areaList(() => ({}))

  const data = $derived.by(() => {
    const routeCountByBlock = new SvelteMap<number, number>()
    const gradeCountByBlock = new SvelteMap<number, SvelteMap<number, number>>()
    for (const route of routes.data) {
      if (route.blockFk != null) {
        routeCountByBlock.set(route.blockFk, (routeCountByBlock.get(route.blockFk) ?? 0) + 1)

        if (route.gradeFk != null) {
          let byGrade = gradeCountByBlock.get(route.blockFk)
          if (byGrade == null) {
            byGrade = new SvelteMap<number, number>()
            gradeCountByBlock.set(route.blockFk, byGrade)
          }
          byGrade.set(route.gradeFk, (byGrade.get(route.gradeFk) ?? 0) + 1)
        }
      }
    }

    const blocks = blocksResult.data.filter((block) => routeCountByBlock.has(block.id))
    const parkingLocations = areasResult.data.flatMap((area) => area.parkingLocations)
    const lineStrings = areasResult.data.flatMap((area) => area.geoPaths)

    return {
      blocks,
      parkingLocations,
      lineStrings,
      routeCountByBlock,
      gradeCountByBlock,
    } satisfies Pick<
      BlocksMapProps,
      'blocks' | 'parkingLocations' | 'lineStrings' | 'routeCountByBlock' | 'gradeCountByBlock'
    >
  })

  return {
    get data() {
      return data
    },
    /** The underlying route resource, exposed so callers can show filter/loading state. */
    routes,
  }
}
