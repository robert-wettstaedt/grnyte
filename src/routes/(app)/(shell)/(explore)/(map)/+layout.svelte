<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { createExploreMapData } from '$lib/map/exploreData.svelte'
  import { parseRouteFilter } from '$lib/map/filter'
  import Map from '$lib/map/Map.svelte'
  import { BLOCK_LABEL_ZOOM, type MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { fade, fly } from 'svelte/transition'
  import Modal from '../Modal/Modal.svelte'
  import { sheetState } from '../Modal/sheetState.svelte'
  import type { LayoutProps } from './$types'
  import CreateOnMap from './CreateOnMap/CreateOnMap.svelte'
  import Filter from './Filter/Filter.svelte'
  import SearchBar from './SearchBar/SearchBar.svelte'

  let { children }: LayoutProps = $props()

  const global = getGlobalState()

  let open = $state(!(page.route.id?.endsWith('/explore') ?? false))
  let mapViewState = $state<null | { center: [number, number]; zoom: number }>(null)
  let restoredFocus = $state<MapFocus | null>(null)

  // Quick-create (FAB / long-press): placement mode plus the transient focus that centres
  // the map on a long-pressed point. Never cleared — Map dedupes equal focus values, so a
  // stale entry can't re-frame the view once a detail `focus` or a new request replaces it.
  let placing = $state<'block' | 'parking' | null>(null)
  let createFocus = $state<MapFocus | null>(null)
  let createOnMap = $state<ReturnType<typeof CreateOnMap>>()

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

    // On back/forward, restore the map view we saved into history state
    // (see beforeNavigate). `focus` wins when a detail item is open.
    if (navigation.type === 'popstate' && page.state?.mapView != null) {
      restoredFocus = {
        center: page.state.mapView.center,
        zoom: page.state.mapView.zoom,
      }
    } else {
      restoredFocus = null
    }
  })

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
      const parking = explore.parkingLocations.find((location) => location.id === id)
      return parking == null ? null : { center: [parking.lat, parking.long], padding, zoom: 16 }
    }

    if (routeId.includes('blocks/')) {
      const block = explore.blocks.find((candidate) => candidate.id === id)
      return block?.geolocation == null
        ? null
        : { center: [block.geolocation.lat, block.geolocation.long], padding, zoom: 16 }
    }

    if (routeId.includes('areas/')) {
      const geoBlocks = explore.blocks.filter(
        (block) => block.geolocation != null && block.areas.some((area) => area.id === id),
      )
      if (geoBlocks.length === 0) return null
      const lats = geoBlocks.map((block) => block.geolocation!.lat)
      const lngs = geoBlocks.map((block) => block.geolocation!.long)
      return { extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)], padding }
    }

    return null
  })

  const effectiveFocus: MapFocus | null = $derived(focus ?? createFocus ?? restoredFocus)

  // Highlight the open block's marker on the map.
  const selectedBlockId = $derived.by(() => {
    if (!(page.route.id ?? '').includes('blocks/')) return undefined
    const id = Number(page.params.id)
    return Number.isFinite(id) ? id : undefined
  })

  // Keyboard prev/next (j/l) is attached by the Modal itself — see Modal/keyboardNav.
</script>

<div class="absolute inset-0">
  <Map
    blocks={explore.blocks}
    parkingLocations={explore.parkingLocations}
    lineStrings={explore.lineStrings}
    routeCountByBlock={explore.routeCountByBlock}
    gradeCountByBlock={explore.gradeCountByBlock}
    {selectedBlockId}
    focus={effectiveFocus}
    pickMode={placing != null}
    onviewchange={(view) => (mapViewState = view)}
    onfeatureopen={() => (sheetState.requestSnap = 0.75)}
    onlongpress={(point) => {
      if (!open) createOnMap?.openAt(point)
    }}
  />
</div>

<CreateOnMap
  bind:this={createOnMap}
  bind:placing
  center={mapViewState?.center ?? null}
  zoom={mapViewState?.zoom ?? null}
  visible={!open}
  onrequestcenter={(center) => (createFocus = { center, zoom: Math.max(mapViewState?.zoom ?? 0, BLOCK_LABEL_ZOOM) })}
/>

{#if (!open || page.route.id?.includes('/search')) && placing == null}
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

{#if explore.isLoading}
  <div class="pointer-events-none fixed top-16 left-0 z-10 flex w-full justify-center" in:fly={{ y: -20 }} out:fade>
    <div
      class="bg-surface-100-900 border-surface-200-800 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap shadow-lg"
    >
      <LoadingIndicator class="w-fit shrink-0" size={4} />
      {m.map_loading()}
    </div>
  </div>
{/if}

{#if !open}
  {@render children?.()}
{/if}

<Modal bind:open onclose={() => goto(resolve('/explore'))}>
  {@render children?.()}
</Modal>
