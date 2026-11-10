/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards.
   SvelteMap made the counter loops pathological in dev: Svelte captures an Error stack per
   set once a signal updates >5 times per flush, costing >1s on the initial /explore load. */
import { debouncedQuery } from '$lib/components/EntitySearch/search.svelte'
import { areaMapList } from '$lib/entities/area/resources.svelte'
import { blockList, blockMapList } from '$lib/entities/block/resources.svelte'
import { routeMapList } from '$lib/entities/route/resources.svelte'
import { syncMark } from '$lib/powersync/marks'
import { quietly } from '$lib/state/pill.svelte'
import type { MatchTest } from '$lib/state/searchQuery.svelte'
import type { QueryPhase } from '$lib/zero/resource.svelte'
import { blockBounds } from './data.svelte'
import { isParsedFilterActive, parseRouteFilter, type ParsedRouteFilter } from './filter'
import { filteredRouteList } from './filteredRoutes.svelte'
import { narrowBlocks, type OpenEntity } from './narrow'
import type { MapData } from './types'

/**
 * What a location picker draws: the unfiltered /explore dataset, plus the box around one area's
 * blocks. The picker frames on that box, and in map mode the saved coordinate is the map centre.
 */
export function createAreaPickerMapData(areaId: () => number, userId: () => number | undefined) {
  const blocks = blockList(() => ({ areaId: areaId() }))
  const mapData = createExploreMapData(() => parseRouteFilter(new URLSearchParams()), userId)
  const areaExtent = $derived(blockBounds(blocks.data))

  return {
    /** Null until one of the area's blocks has a pin, which leaves the picker unframed. */
    get areaExtent() {
      return areaExtent
    },
    mapData,
  }
}

/**
 * The /explore map dataset: all blocks/areas/parking/paths plus the per-block
 * route & grade counts that feed the donut markers. Shared so the parking
 * picker renders the exact same map as /explore.
 */
export function createExploreMapData(
  filters: () => ParsedRouteFilter,
  userId: () => number | undefined,
  search: () => string = () => '',
  open: () => OpenEntity = () => null,
) {
  const blocksResult = blockMapList()
  const areasResult = areaMapList()
  // Slim rows (no related trees): the map reads id/blockFk/gradeFk per route.
  const routes = filteredRouteList(
    routeMapList(() => filters().filter),
    filters,
    userId,
  )

  // Route names and descriptions, as the search dropdown matches them, through the map's filter.
  const typed = $derived(search().trim())
  const term = debouncedQuery(
    () => typed,
    250,
    () => true,
  )
  const searchable = (text: string) => text.length >= 2
  // Quietly: search results never hold the screen's pill.
  const found = quietly(() =>
    filteredRouteList(
      routeMapList(() => ({ ...filters().filter, content: term() }), { enabled: () => searchable(term()) }),
      filters,
      userId,
    ),
  )
  // While the debounce or the query is pending, the map narrows by the last answered search, its text and its
  // route matches together, so a slow answer never shows a half-run search.
  let answered = { routeBlocks: new Set<number>(), text: '' }
  const narrowSearch = $derived.by(() => {
    if (!searchable(typed)) {
      // A search the reader cleared or left must not come back while the next one is pending.
      answered = { routeBlocks: new Set<number>(), text: '' }
      return { routeBlocks: answered.routeBlocks, text: typed }
    }
    if (term() === typed && found.phase.kind !== 'loading') {
      answered = { routeBlocks: new Set(found.data.map((route) => route.blockFk)), text: typed }
    }
    return answered
  })

  // Each field is its own $derived so it only recomputes when its own source query
  // changes: a parking mutation re-emits only the areas query, so `parkingLocations`
  // and `lineStrings` update while `blocks`/route counts (and the donut markers they
  // feed) keep stable references. That keeps the map's per-layer effects granular: an
  // update touches only the affected layer instead of rebuilding (and flashing) them all.
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

  let previousBlocks: typeof blocksResult.data | undefined
  const blocks = $derived.by(() => {
    return (previousBlocks = narrowBlocks({
      areas: areasResult.data,
      blocks: blocksResult.data,
      filterActive: isParsedFilterActive(filters()),
      open: open(),
      previous: previousBlocks,
      routeBlocks: narrowSearch.routeBlocks,
      routeCountByBlock,
      search: narrowSearch.text,
    }))
  })
  // Measurement mark for the remeasure; goes in R1 with the timeline.
  $effect(() => {
    if (areasResult.data.length > 0 || blocksResult.data.length > 0) syncMark('map: places ready')
  })
  const parkingLocations = $derived(areasResult.data.flatMap((area) => area.parkingLocations))
  const lineStrings = $derived(areasResult.data.flatMap((area) => area.geoPaths))

  // True while nothing is renderable yet, or while a filter hides every block until routes land.
  const isLoading = $derived.by(() => {
    const loading = (phase: QueryPhase) => phase.kind === 'loading'
    return (
      [blocksResult.phase, areasResult.phase].some(loading) ||
      (isParsedFilterActive(filters()) && loading(routes.phase))
    )
  })
  // Offline with routes never synced is `unavailable`: no count is known there either.
  const countsUnknown = $derived(['loading', 'unavailable'].includes(routes.phase.kind))

  const matches = $derived.by((): MatchTest => {
    if (!isParsedFilterActive(filters())) return null
    const ids = new Set(routes.data.map((route) => route.id))
    return (route) => ids.has(route.id)
  })
  // Every route has a block, so the map's per-block counts are also the filter sheet's totals.
  const filterCounts = $derived.by(() => {
    let total = 0
    for (const n of routeCountByBlock.values()) total += n
    const countByGrade = new Map<number, number>()
    for (const grades of gradeCountByBlock.values()) {
      for (const [grade, n] of grades) countByGrade.set(grade, (countByGrade.get(grade) ?? 0) + n)
    }
    return { countByGrade, total }
  })

  // Per-field getters: bound one by one (or spread as getters), an unchanged field keeps its
  // reference and only the changed map layer re-runs. A spread of plain values re-runs them all.
  return {
    get areas() {
      return areasResult.data
    },
    get blocks() {
      return blocks
    },
    get countsUnknown() {
      return countsUnknown
    },
    /** What the filter sheet counts and draws its grade bars from; `matchPhase` says what may be said. */
    get filterCounts() {
      return filterCounts
    },
    // Unconfirmed on purpose: marker counts follow the rows on hand, a number settling beats a blank.
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
    get matches() {
      return matches
    },
    get matchPhase() {
      return routes.phase
    },
    get parkingLocations() {
      return parkingLocations
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
  } satisfies MapData & {
    countsUnknown: boolean
    filterCounts: { countByGrade: Map<number, number>; total: number }
    isLoading: boolean
    matches: MatchTest
    matchPhase: QueryPhase
  }
}

/** The props a location picker hands `<Map>`: the explore dataset without its area donuts. Getters, so a
 *  spread prop tracks only its own field. */
export function pickerMapProps(data: MapData): Omit<MapData, 'areas'> {
  return {
    get blocks() {
      return data.blocks
    },
    get countsUnknown() {
      return data.countsUnknown
    },
    get gradeCountByBlock() {
      return data.gradeCountByBlock
    },
    get lineStrings() {
      return data.lineStrings
    },
    get parkingLocations() {
      return data.parkingLocations
    },
    get routeCountByBlock() {
      return data.routeCountByBlock
    },
  }
}
