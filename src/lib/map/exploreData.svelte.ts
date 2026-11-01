/* eslint-disable svelte/prefer-svelte-reactivity -- these collections are rebuilt wholesale
   inside $derived (the new reference is the reactivity) and never mutated afterwards.
   SvelteMap made the counter loops pathological in dev: Svelte captures an Error stack per
   set once a signal updates >5 times per flush, costing >1s on the initial /explore load. */
import { debouncedQuery } from '$lib/components/EntitySearch/search.svelte'
import { areaMapList } from '$lib/entities/area/resources.svelte'
import { userAscentList } from '$lib/entities/ascent/resources.svelte'
import { blockList, blockMapList } from '$lib/entities/block/resources.svelte'
import { routeMapList, routesByIds } from '$lib/entities/route/resources.svelte'
import { isFieldDevice } from '$lib/state/device.svelte'
import { quietly } from '$lib/state/pill.svelte'
import type { MatchTest } from '$lib/state/searchQuery.svelte'
import type { QueryPhase } from '$lib/zero/resource.svelte'
import { blockBounds } from './data.svelte'
import { isParsedFilterActive, parseRouteFilter, type ParsedRouteFilter } from './filter'
import { filteredRouteList } from './filteredRoutes.svelte'
import { narrowBlocks, type OpenEntity } from './narrow'
import { answersFromSummary, countsFromSummary, inGradeRange, withoutRoutes } from './summary'
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

const ANSWERED: QueryPhase = { empty: false, kind: 'answered' }

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
  const fromSummary = $derived(answersFromSummary(filters()))
  // Joined on the device from the guidebook's flat rows, so a field device hydrates nothing twice.
  const blocksResult = blockMapList()
  const areasResult = areaMapList()
  // Slim rows (no related trees): the map reads id/blockFk/gradeFk per route.
  // A field device keeps every route anyway; without this second query holding them, reopening the
  // app re-sends all of them (measured 7.0 MB against 3.5 MB at region 32's size).
  const routesLocal = $derived(!fromSummary || isFieldDevice())
  const routes = filteredRouteList(
    routeMapList(() => filters().filter, { enabled: () => routesLocal }),
    filters,
    userId,
  )
  const todo = $derived(fromSummary && filters().ascentStatus === 'todo')
  const ascents = userAscentList(userId, () => todo)
  const sentSet = $derived(
    new Set(ascents.data.filter((ascent) => ascent.type !== 'attempt').map((ascent) => ascent.routeFk)),
  )
  const sentIds = $derived([...sentSet])
  const sent = routesByIds(() => sentIds, { enabled: () => todo })
  const summary = $derived.by(() => {
    if (!fromSummary) return undefined
    const counts = countsFromSummary(blocksResult.data, filters().filter)
    return todo ? withoutRoutes(counts, sent.data, filters().filter) : counts
  })
  // Whether a route counts under the summaries: the filter's grade range, less the reader's sends.
  const keptBySummary = (route: { gradeFk: number | undefined; id: number }) =>
    inGradeRange(filters().filter, route.gradeFk) && !(todo && sentSet.has(route.id))

  // Route names and descriptions, as the search dropdown matches them, through the map's filter. A field
  // device answers from its own rows; `ttl: 'none'` stops a term syncing once the reader moves past it.
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
      routeMapList(() => ({ ...filters().filter, content: term() }), {
        enabled: () => searchable(term()),
        ttl: 'none',
      }),
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
    // A field device keeps every route, so its own rows answer without waiting on a stalled connection.
    if (term() === typed && (found.phase.kind !== 'loading' || isFieldDevice())) {
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
    if (summary) return summary.routeCountByBlock
    const counts = new Map<number, number>()
    for (const route of routes.data) {
      if (route.blockFk != null) counts.set(route.blockFk, (counts.get(route.blockFk) ?? 0) + 1)
    }
    return counts
  })

  const gradeCountByBlock = $derived.by(() => {
    if (summary) return summary.gradeCountByBlock
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
  const parkingLocations = $derived(areasResult.data.flatMap((area) => area.parkingLocations))
  const lineStrings = $derived(areasResult.data.flatMap((area) => area.geoPaths))

  // True only while nothing is renderable yet: local-first preloads flip the
  // source queries to `ready` fast, so this is the cold-load case (no markers).
  const summaryPhase = $derived.by((): QueryPhase => {
    // a disabled query never answers: no reader, or no sends, is nothing to wait for
    if (todo && userId() != null && ascents.phase.kind !== 'answered') return ascents.phase
    if (todo && sentIds.length > 0 && sent.phase.kind !== 'answered') return sent.phase
    return blocksResult.phase.kind === 'answered' ? ANSWERED : blocksResult.phase
  })
  const isLoading = $derived(
    (fromSummary ? summaryPhase : routes.phase).kind === 'loading' ||
      blocksResult.phase.kind === 'loading' ||
      areasResult.phase.kind === 'loading',
  )

  const matches = $derived.by((): MatchTest => {
    if (!isParsedFilterActive(filters())) return null
    if (fromSummary) return keptBySummary
    const ids = new Set(routes.data.map((route) => route.id))
    return (route) => ids.has(route.id)
  })
  const matchPhase = $derived(fromSummary ? summaryPhase : routes.phase)
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

  // A stable object with per-field reactive getters. Callers bind each field to `<Map>`
  // individually (never spread), so a field whose source query didn't change keeps a
  // stable reference and its map layer's effect doesn't re-run: only the changed layer does.
  return {
    get blocks() {
      return blocks
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
      return matchPhase
    },
    get parkingLocations() {
      return parkingLocations
    },
    get routeCountByBlock() {
      return routeCountByBlock
    },
  } satisfies MapData & {
    filterCounts: { countByGrade: Map<number, number>; total: number }
    isLoading: boolean
    matches: MatchTest
    matchPhase: QueryPhase
  }
}
