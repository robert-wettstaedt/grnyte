<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { trackHistoryDepth } from '$lib/state/navigation.svelte'
  import { fly } from 'svelte/transition'
  import type { LayoutProps } from './$types'
  import { createExploreMapData } from '$lib/map/exploreData.svelte'
  import { parseRouteFilter } from '$lib/map/filter'
  import Map from '$lib/map/Map.svelte'
  import type { MapFocus } from '$lib/map/types'
  import Filter from './Filter/Filter.svelte'
  import Modal from './Modal/Modal.svelte'
  import { sheetState } from './Modal/sheetState.svelte'
  import SearchBar from './SearchBar/SearchBar.svelte'

  let { children }: LayoutProps = $props()

  const global = getGlobalState()

  // Track same-origin history depth so back buttons can fall back to an in-app
  // route instead of leaving the origin. See $lib/state/navigation.svelte.
  trackHistoryDepth()

  let open = $state(!(page.route.id?.endsWith('/explore') ?? false))
  let mapViewState = $state<{ center: [number, number]; zoom: number } | null>(null)
  let restoredFocus = $state<MapFocus | null>(null)

  beforeNavigate((navigation) => {
    if (navigation.from?.route.id !== navigation.to?.route.id) {
      sheetState.title = ''
      sheetState.subtitle = null
      sheetState.headerLeft = null
      sheetState.toolbar = null
    }

    if (mapViewState != null) {
      replaceState('', $state.snapshot({ ...page.state, mapView: mapViewState }))
    }
  })

  // The modal is open on detail routes (e.g. areas/[id]) and closed on the
  // /explore index — keep `open` in sync as the user navigates.
  afterNavigate((navigation) => {
    open = !(navigation.to?.route.id?.endsWith('/explore') ?? false)
  })

  // afterNavigate((event) => {
  //   open = !(event.to?.route.id?.endsWith('(modal)') ?? false)
  //   if (open) {
  //     sheetState.requestSnap = event.to?.route.id?.includes('parking/') ? 0.25 : 0.75
  //   }

  //   if (event.type === 'popstate' && page.state?.mapView != null) {
  //     restoredFocus = {
  //       center: page.state.mapView.center,
  //       zoom: page.state.mapView.zoom,
  //     }
  //   } else {
  //     restoredFocus = null
  //   }
  // })

  // Parsing the URL into typed filter values lives in ./Filter/filter, and
  // applying it to routes (incl. the client-side ascent/favorites filters) in
  // ./Filter/filteredRoutes — so this layout only composes the result for the map.
  //
  // `page.url` changes on every navigation, so re-parsing would hand the route
  // query a new (value-identical) filter object each time a detail sheet opens —
  // re-running the whole map-data chain and flickering the markers. Keep the same
  // reference until the filter actually changes so navigation leaves the map still.
  let cachedFilters = parseRouteFilter(page.url.searchParams)
  const filters = $derived.by(() => {
    const next = parseRouteFilter(page.url.searchParams)
    if (JSON.stringify(next) !== JSON.stringify(cachedFilters)) {
      cachedFilters = next
    }
    return cachedFilters
  })

  const explore = createExploreMapData(
    () => filters,
    () => global.user?.id,
  )

  // Frame the open detail item on the map. Padding keeps it clear of the detail
  // sheet — a wide left inset for the desktop side panel, a tall bottom inset for
  // the mobile bottom sheet — so the marker lands in the visible area, not behind it.
  const focus: MapFocus | null = $derived.by(() => {
    const routeId = page.route.id ?? ''
    const id = Number(page.params.id)
    if (!Number.isFinite(id) || typeof window === 'undefined') return null

    const padding: [number, number, number, number] =
      window.innerWidth >= 768 ? [60, 60, 60, 580] : [60, 60, Math.round(window.innerHeight * 0.75), 60]

    if (routeId.includes('parking/')) {
      const parking = explore.data.parkingLocations.find((location) => location.id === id)
      return parking == null ? null : { center: [parking.lat, parking.long], zoom: 16, padding }
    }

    if (routeId.includes('blocks/')) {
      const block = explore.data.blocks.find((candidate) => candidate.id === id)
      return block?.geolocation == null
        ? null
        : { center: [block.geolocation.lat, block.geolocation.long], zoom: 16, padding }
    }

    if (routeId.includes('areas/')) {
      // Every block anywhere beneath the area (its id appears in the block's ancestor trail).
      const geoBlocks = explore.data.blocks.filter(
        (block) => block.geolocation != null && block.areas.some((area) => area.id === id),
      )
      if (geoBlocks.length === 0) return null
      const lats = geoBlocks.map((block) => block.geolocation!.lat)
      const lngs = geoBlocks.map((block) => block.geolocation!.long)
      return { extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)], padding }
    }

    return null
  })

  const effectiveFocus: MapFocus | null = $derived(focus ?? restoredFocus)
</script>

<div class="absolute inset-0">
  <Map {...explore.data} focus={effectiveFocus} onviewchange={(view) => (mapViewState = view)} />
</div>

{#if !open || page.route.id?.includes('/search')}
  <div
    class="fixed top-2 left-0 z-10 flex w-full items-center justify-center gap-2 px-1 md:left-27 md:w-sm md:px-0 lg:w-md"
    in:fly={{ y: -200 }}
    out:fly={{ y: -200 }}
  >
    <a class="shrink-0 md:hidden" href={resolve('/explore')}>
      <!-- 44px reads as optically equal to the 48px bar (a solid square looks heavier than the padded pill). -->
      <img class="h-11 w-11" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={44} height={44} />
    </a>

    <SearchBar>
      {#snippet trailing()}
        <Filter loading={explore.routes.status === 'loading'} routes={explore.routes.data} />
      {/snippet}
    </SearchBar>
  </div>
{/if}

{#if !open}
  {@render children?.()}
{/if}

<Modal bind:open onclose={() => goto(resolve('/explore'))}>
  {@render children?.()}
</Modal>
