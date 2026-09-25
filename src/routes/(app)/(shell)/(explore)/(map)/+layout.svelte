<script lang="ts">
  import { afterNavigate, beforeNavigate, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { RouteId } from '$app/types'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import UpdateBadge from '$lib/components/UpdateBadge/UpdateBadge.svelte'
  import { createExploreMapData } from '$lib/map/exploreData.svelte'
  import { parseRouteFilter } from '$lib/map/filter'
  import Map from '$lib/map/Map.svelte'
  import { BLOCK_LABEL_ZOOM, type MapCameraClaim, type MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { exit } from '$lib/state/navigation.svelte'
  import { liveSearchQuery } from '$lib/state/searchQuery.svelte'
  import { applyUpdateOnClick } from '$lib/state/updateReady.svelte'
  import { visualViewport } from '$lib/state/visualViewport.svelte'
  import { untrack } from 'svelte'
  import { fade, fly } from 'svelte/transition'
  import Modal from '../Modal/Modal.svelte'
  import { sheetState } from '../Modal/sheetState.svelte'
  import type { LayoutProps } from './$types'
  import { cameraTarget } from './cameraTarget'
  import CreateOnMap from './CreateOnMap/CreateOnMap.svelte'
  import Filter from './Filter/Filter.svelte'
  import SearchBar from './SearchBar/SearchBar.svelte'

  let { children }: LayoutProps = $props()

  const global = getGlobalState()

  // Keep the search bar glued to the visible viewport top so the iOS on-screen
  // keyboard can't scroll this `fixed` layer up behind the status bar.
  const vv = visualViewport()

  // Matched by route id rather than by a path suffix: `endsWith('/explore')` reads as a guess, and
  // a route moved out of this group would silently stop matching. These are compile errors instead.
  const EXPLORE_ROUTE: RouteId = '/(app)/(shell)/(explore)/(map)/explore'
  const SEARCH_ROUTE: RouteId = '/(app)/(shell)/(explore)/(map)/search'

  let open = $state(page.route.id !== EXPLORE_ROUTE)
  let mapViewState = $state<null | { center: [number, number]; zoom: number }>(null)
  let restoredFocus = $state<MapFocus | null>(null)

  // Quick-create (FAB or long-press): placement mode plus the focus that centres on the pressed
  // point. Cleared on navigation, or a stale point outranks the remembered camera.
  let placing = $state<'block' | 'parking' | null>(null)
  let createFocus = $state<MapFocus | null>(null)
  let createOnMap = $state<ReturnType<typeof CreateOnMap>>()

  // Bumped on every reader-owned framing, so two in a row are different claims.
  let readerClaimSeq = $state(0)

  beforeNavigate((navigation) => {
    if (navigation.from?.route.id !== navigation.to?.route.id) {
      sheetState.title = ''
      sheetState.subtitle = null
      sheetState.headerLeft = null
      sheetState.toolbar = null
    }
  })

  // Saved as the view changes, onto the entry that is current while it IS current.
  //
  // NOT from `beforeNavigate`, which is where this lived: that runs after the browser has already
  // moved on a popstate, so the write landed on the entry being arrived at and stamped it with the
  // departing entry's state, Kit's own history index included. Two entries sharing an index make
  // Kit read a later back as delta 0, so it renders nothing while the URL moves.
  //
  // `untrack` around the read: merging `page.state` is what preserves keys this layout does not
  // own, and tracking it would make the effect retrigger on its own write.
  $effect(() => {
    const view = mapViewState
    if (view == null) return

    untrack(() => {
      const stored = page.state?.mapView
      if (stored?.center[0] === view.center[0] && stored?.center[1] === view.center[1] && stored.zoom === view.zoom) {
        return
      }
      replaceState('', $state.snapshot({ ...page.state, mapView: view }))
    })
  })

  // The modal is open on detail routes (e.g. areas/[id]) and closed on the
  // /explore index. Keep `open` in sync as the user navigates.
  afterNavigate((navigation) => {
    open = navigation.to?.route.id !== EXPLORE_ROUTE

    // On back/forward, restore the map view saved into this entry's history state
    // (see the effect above). `focus` wins when a detail item is open.
    if (navigation.type === 'popstate' && page.state?.mapView != null) {
      restoredFocus = {
        center: page.state.mapView.center,
        zoom: page.state.mapView.zoom,
      }
      readerClaimSeq += 1
    } else {
      restoredFocus = null
    }
    // Cleared, or a stale long-press point re-frames on a place the reader left.
    createFocus = null
  })

  // Parsing the URL into typed filter values lives in ./Filter/filter, and
  // applying it to routes (incl. the client-side ascent/favorites filters) in
  // ./Filter/filteredRoutes, so this layout only composes the result for the map.
  //
  // `page.url` changes on every navigation, so re-parsing would hand the route
  // query a new (value-identical) filter object each time a detail sheet opens,
  // re-running the whole map-data chain and flickering the markers. Keep the same
  // reference until the filter changes so navigation leaves the map still.
  let cachedFilters = parseRouteFilter(page.url.searchParams)
  const filters = $derived.by(() => {
    const next = parseRouteFilter(page.url.searchParams)
    if (JSON.stringify(next) !== JSON.stringify(cachedFilters)) {
      cachedFilters = next
    }
    return cachedFilters
  })

  // The live search-bar text narrows the map markers as the user types (not only
  // the committed `?q=` the /search list reads). It persists across a detail
  // round trip (the bar restores from it on remount), so it survives open/close.
  const search = liveSearchQuery()

  const explore = createExploreMapData(
    () => filters,
    () => global.user?.id,
    () => search.current,
  )

  // The map URL to return to when a sheet closes: always `/explore` carrying the
  // current filter params (but not the search `q`: the live query rides back via
  // the signal, so a cleared search can't reappear from a stale URL). Captured while
  // on an explore route; retained while a detail route is open. Mapping the search
  // route to `/explore` is also what lets the search list itself dismiss to the map.
  // Deterministic on purpose: history depth can't be relied on (mobile sheet history,
  // intermediate detail-to-detail hops), but this URL literally carries the filters back.
  let exploreReturn = resolve('/explore')
  $effect(() => {
    const id = page.route.id
    if (id === EXPLORE_ROUTE || id === SEARCH_ROUTE) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- throwaway parse to build a return-URL string, not reactive state
      const params = new URLSearchParams(page.url.search)
      params.delete('q')
      const qs = params.toString()
      exploreReturn = resolve('/explore') + (qs ? `?${qs}` : '')
    }
  })

  // What the open route wants of the camera. One triage in `cameraTarget`, so the framing and the
  // claim cannot disagree about which entity is open. Padding keeps the marker clear of the sheet:
  // a left inset for the desktop panel, a bottom inset for the mobile sheet.
  const target = $derived.by(() => {
    // Tracked, so a fresh claim re-samples how much of the map is covered.
    const showOnMapRequest = sheetState.showOnMapRequest
    if (typeof window === 'undefined') return null

    // The height is sampled, never tracked. Tracked, every frame of a sheet drag would re-frame,
    // and the camera would crawl under the reader's finger.
    const padding = untrack<[number, number, number, number]>(() => {
      if (window.innerWidth >= 768) return [60, 60, 60, 580]
      // A pending snap wins, because a marker tap asks for 0.75 and the sheet arrives ~50ms later.
      // Measured against the app frame, because the banner shrinks it without moving the sheet.
      const frame = document.querySelector('[data-app-frame]')?.clientHeight ?? window.innerHeight
      const pending = sheetState.requestSnap
      const top = sheetState.sheetTop
      const covered =
        pending != null
          ? Math.round(frame * pending)
          : top == null
            ? Math.round(frame * 0.75)
            : Math.max(0, frame - top)
      return [60, 60, covered, 60]
    })

    return cameraTarget({
      blocks: explore.blocks,
      id: Number(page.params.id),
      padding,
      parkingLocations: explore.parkingLocations,
      routeId: page.route.id ?? '',
      showOnMapRequest,
    })
  })

  const focus: MapFocus | null = $derived(target?.focus ?? null)

  const effectiveFocus: MapFocus | null = $derived(focus ?? createFocus ?? restoredFocus)

  // Only this layout knows whether the open entity can be framed, so it tells the sheet.
  $effect(() => {
    sheetState.canShowOnMap = focus != null
    // Cleared on teardown, because the flag outlives this layout.
    return () => (sheetState.canShowOnMap = false)
  })

  // Claimed from the route, so the camera has an owner before the row that will frame it arrives.
  const cameraClaim = $derived.by<MapCameraClaim | null>(() => {
    // Always claims, even with nothing to frame. The content fit paints under it meanwhile.
    if (target != null) return target.claim
    // A remembered view and a quick-create framing are both the reader's own. The sequence keys
    // them apart, or the second claim is deduped away.
    return restoredFocus != null || createFocus != null ? { key: String(readerClaimSeq), kind: 'reader' } : null
  })

  // The controls ride above the sheet instead of hiding behind it. Tracked, unlike the padding
  // above, because this one must follow the finger.
  //
  // Capped at the half open snap. Above that the sheet is the screen. Mobile only.
  const controlsLift = $derived.by<null | number>(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return null
    const top = sheetState.sheetTop
    if (top == null) return null
    const frame = document.querySelector('[data-app-frame]')?.clientHeight ?? window.innerHeight
    const covered = Math.max(0, frame - top)
    return Math.round(Math.min(covered, frame * 0.5)) + 8
  })

  // Highlight the open block's marker on the map.
  const selectedBlockId = $derived.by(() => {
    if (!(page.route.id ?? '').includes('blocks/')) return undefined
    const id = Number(page.params.id)
    return Number.isFinite(id) ? id : undefined
  })

  // Keyboard prev/next (j/l) is attached by the Modal itself (see Modal/keyboardNav).
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
    {cameraClaim}
    {controlsLift}
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
  visible={!open}
  onrequestcenter={(center) => {
    createFocus = { center, zoom: Math.max(mapViewState?.zoom ?? 0, BLOCK_LABEL_ZOOM) }
    readerClaimSeq += 1
  }}
/>

{#if (!open || page.route.id === SEARCH_ROUTE) && placing == null}
  <div
    class="fixed top-2 left-0 z-10 flex w-full items-center justify-center gap-2 px-1 md:left-27 md:w-sm md:px-0 lg:w-md"
    style:top="calc(0.5rem + {vv.offsetTop}px)"
    in:fly={{ y: -200 }}
    out:fly={{ y: -200 }}
  >
    <a class="relative shrink-0 md:hidden" href={resolve('/explore')} onclick={applyUpdateOnClick}>
      <!-- 44px reads as optically equal to the 48px bar (a solid square looks heavier than the padded pill). -->
      <img class="h-11 w-11" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={44} height={44} />
      <UpdateBadge />
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

<!-- Close back to the explore URL we came from (its filters + committed `?q=`), so
     closing a detail doesn't drop the filters; the search text rides back via the
     persisted live query. -->
<!-- `exit`, not a goto: a dismissed sheet must not be somewhere the back button can return to. -->
<Modal bind:open onclose={() => exit(exploreReturn)}>
  {@render children?.()}
</Modal>
