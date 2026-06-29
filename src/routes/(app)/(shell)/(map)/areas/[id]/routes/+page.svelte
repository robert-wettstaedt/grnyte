<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import { userLocation } from '$lib/map/geolocation.svelte'
  import { haversineMetres, type Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import Filter from '../../../Filter/Filter.svelte'
  import { parseRouteFilter } from '$lib/map/filter'
  import { filteredRouteList } from '$lib/map/filteredRoutes.svelte'
  import { sheetState } from '../../../Modal/sheetState.svelte'
  import SearchField from '../../../SearchBar/SearchField.svelte'
  import { DEFAULT_DIR, parseSort, sortRoutes } from './sort'

  const global = getGlobalState()

  const areaId = $derived(Number(page.params.id))

  // Getters keep the resources live across navigation, mirroring the area page.
  const area = areaDetail(() => areaId)

  // Free-text route search, applied client-side via the query's `content` arg.
  // Local (not URL) so typing never navigates.
  let search = $state('')

  // Reuse the global route filter (URL params → typed filter → client-side
  // ascent/favorites), scoped to this area by injecting areaId + the search term.
  const filters = $derived.by(() => {
    const parsed = parseRouteFilter(page.url.searchParams)
    return { ...parsed, filter: { ...parsed.filter, areaId, content: search.trim() || undefined } }
  })
  const routes = filteredRouteList(
    () => filters,
    () => global.user?.id,
  )

  // Block coordinates power the distance sort (route → block → geolocation).
  const blocks = blockList(() => ({ areaId }))
  const blockGeo = $derived.by(() => {
    const map = new SvelteMap<number, Coords>()
    for (const block of blocks.data) {
      if (block.geolocation != null) {
        map.set(block.id, { lat: block.geolocation.lat, long: block.geolocation.long })
      }
    }
    return map
  })

  // Sort lives in the URL now (set from the Filter sheet); the page just reads it.
  const sort = $derived(parseSort(page.url.searchParams))

  // Sort options offered in the Filter sheet — distance only when blocks have coords.
  const sortOptions = $derived([
    { value: 'grade', label: m.filter_grade() },
    { value: 'name', label: m.sort_name() },
    { value: 'rating', label: m.filter_rating() },
    ...(blockGeo.size > 0 ? [{ value: 'distance', label: m.sort_distance() }] : []),
  ])

  // Request the user's location only once distance sort is actually chosen.
  const location = userLocation(() => sort.field === 'distance')

  const distanceOf = (route: RouteListItem): number => {
    const geo = blockGeo.get(route.blockFk)
    if (geo == null || location.current == null) {
      return Infinity
    }
    return haversineMetres(location.current, geo)
  }

  const sorted = $derived(sortRoutes(routes.data, sort.field, sort.dir, distanceOf))

  // Infinite scroll: render a growing slice so a large area doesn't dump every
  // route into the DOM at once. A sentinel below the list grows the window.
  const PAGE = 30
  let limit = $state(PAGE)
  const visible = $derived(sorted.slice(0, limit))

  let sentinel = $state<HTMLElement>()

  // Reset to the first window whenever the list changes — area, filter, sort
  // (all in the URL) or the local search term. Re-sorting scrolls back to the top
  // of the new order (the old scroll position points at different routes anyway).
  $effect(() => {
    void `${areaId}?${page.url.search}|${search}`
    limit = PAGE
  })

  $effect(() => {
    const el = sentinel
    if (el == null) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          limit += PAGE
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  })

  const gradeLabel = (gradeFk: number | undefined): string => {
    if (gradeFk == null) {
      return '—'
    }
    const value = global.grades.find((grade) => grade.id === gradeFk)?.[global.gradingScale]
    if (value == null) {
      return '—'
    }
    // Grade strings carry the scale as a redundant prefix (e.g. `FB 6A+`).
    return value.startsWith(`${global.gradingScale} `) ? value.slice(global.gradingScale.length + 1) : value
  }

  // The shared Modal renders its header from sheetState; label it with the area
  // and pin the filter/sort controls there (the sheet's scroll wrapper breaks
  // `position: sticky`, so an in-list toolbar would scroll away).
  $effect(() => {
    sheetState.title = m.area_allRoutes()
    sheetState.subtitle = area.data?.name ?? null
    sheetState.headerLeft = headerLeft
    sheetState.toolbar = toolbar
  })
</script>

<svelte:head>
  <title>
    {area.data == null ? m.area_allRoutes() : `${m.area_allRoutes()} · ${area.data.name}`} – {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

{#snippet headerLeft()}
  <button
    class="btn-icon preset-filled-surface-200-800"
    onclick={() => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: page.params.id! }))}
    title={m.common_back()}
  >
    <Icon name="arrow-left" />
  </button>
{/snippet}

{#snippet toolbar()}
  <SearchField bind:value={search} placeholder={m.routes_searchPlaceholder()} onClear={() => (search = '')}>
    {#snippet trailing()}
      <Filter
        loading={routes.status === 'loading'}
        routes={routes.data}
        {sortOptions}
        sortDefaults={DEFAULT_DIR}
        placement="sheet"
      />
    {/snippet}
  </SearchField>
{/snippet}

<QueryState resource={routes}>
  {#snippet ready()}
    <nav class="flex flex-col gap-1.5">
      {#each visible as route (route.id)}
        <RouteRow
          band={getGradeBand(route.gradeFk, global.grades)}
          grade={gradeLabel(route.gradeFk)}
          name={route.name}
          stars={route.rating}
        />
      {/each}

      {#if visible.length < sorted.length}
        <div bind:this={sentinel} class="h-px"></div>
      {/if}
    </nav>
  {/snippet}
</QueryState>
