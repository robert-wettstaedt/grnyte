<script lang="ts">
  import { afterNavigate, beforeNavigate, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { RouteId } from '$app/types'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import PillHost from '$lib/components/StatusPill/PillHost.svelte'
  import UpdateBadge from '$lib/components/UpdateBadge/UpdateBadge.svelte'
  import { createExploreMapData } from '$lib/map/exploreData.svelte'
  import { FILTER_PARAM_KEYS, isParsedFilterActive } from '$lib/map/filter'
  import Map from '$lib/map/Map.svelte'
  import type { OpenEntity } from '$lib/map/narrow'
  import { BLOCK_LABEL_ZOOM, type MapCameraClaim, type MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { exit, replaceUrl } from '$lib/state/navigation.svelte'
  import { createPillSurface } from '$lib/state/pill.svelte'
  import {
    liveRouteFilter,
    liveSearchQuery,
    setLiveRouteFilter,
    setLiveSearchQuery,
    setMatchingRoutes,
  } from '$lib/state/searchQuery.svelte'
  import { applyUpdateOnClick } from '$lib/state/updateReady.svelte'
  import { visualViewport } from '$lib/state/visualViewport.svelte'
  import { untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import Modal from '../Modal/Modal.svelte'
  import { sheetState } from '../Modal/sheetState.svelte'
  import type { LayoutProps } from './$types'
  import { cameraTarget, entityOf } from './cameraTarget'
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
  const AREA_ROUTES_ROUTE: RouteId = '/(app)/(shell)/(explore)/(map)/areas/[id]/routes'

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

  // The URL writes the shared filter only where it carries one; every other screen (a detail, a deep
  // link) keeps the last one. The setter keeps an equal filter's reference, so navigation leaves the map still.
  const writesFilter = (id: null | string) => id === EXPLORE_ROUTE || id === SEARCH_ROUTE || id === AREA_ROUTES_ROUTE
  if (writesFilter(page.route.id)) setLiveRouteFilter(page.url.searchParams)
  $effect.pre(() => {
    if (writesFilter(page.route.id)) setLiveRouteFilter(page.url.searchParams)
  })
  const routeFilter = liveRouteFilter()
  const filters = $derived(routeFilter.current.parsed)

  // The live search-bar text narrows the map markers as the user types (not only
  // the committed `?q=` the /search list reads). It persists across a detail
  // round trip (the bar restores from it on remount), so it survives open/close.
  const search = liveSearchQuery()

  // The open block or area, which no search or filter may hide (parking is never narrowed).
  const openEntity = $derived.by<OpenEntity>(() => {
    const kind = entityOf(page.route.id ?? '')
    const id = Number(page.params.id)
    return (kind === 'blocks' || kind === 'areas') && Number.isFinite(id) ? { id, kind } : null
  })

  // Before the map's data, so it holds this pill; the sheet over the map draws its own.
  const pill = createPillSurface()

  const explore = createExploreMapData(
    () => filters,
    () => global.user?.id,
    // Placing a block or parking spot shows every block, so the reader sees what is already there.
    () => (placing == null ? search.current : ''),
    () => openEntity,
  )

  // Detail screens report "n of N" against the rows this filtered map already holds.
  $effect(() => setMatchingRoutes(isParsedFilterActive(filters), explore.routes.data, explore.routes.phase))

  // Nothing on hand to draw yet: the map says so in its pill, over the generic syncing.
  $effect(() => pill.offer(() => (explore.isLoading ? { kind: 'status', label: m.map_loading() } : undefined)))

  const searchBarShown = $derived((!open || page.route.id === SEARCH_ROUTE) && placing == null)

  // The search bar is hidden under a detail, so the map says what still narrows it, and clears both.
  const clearNarrowing = () => {
    setLiveSearchQuery('')
    setLiveRouteFilter(new URLSearchParams())
    // The route list's URL writes the filter, so it must drop the keys or they come straight back.
    if (page.route.id === AREA_ROUTES_ROUTE) {
      const url = new URL(page.url)
      for (const key of FILTER_PARAM_KEYS) url.searchParams.delete(key)
      void replaceUrl(url)
    }
  }
  $effect(() =>
    pill.offer(() => {
      const query = search.current
      const filtered = isParsedFilterActive(filters)
      if (!open || page.route.id === SEARCH_ROUTE || (query === '' && !filtered)) return undefined
      return {
        announcement: !filtered
          ? m.map_searchMatches({ query })
          : query === ''
            ? m.map_filtersMatch()
            : m.map_searchAndFiltersMatch({ query }),
        dismissLabel: !filtered
          ? m.map_clearSearch()
          : query === ''
            ? m.map_clearFilters()
            : m.map_clearSearchAndFilters(),
        icon: query === '' ? 'filter' : 'search',
        kind: 'dismiss',
        label: !filtered ? query : query === '' ? m.map_filtersOn() : m.map_searchAndFilters({ query }),
        ondismiss: clearNarrowing,
      }
    }),
  )

  // Where a closing sheet returns: `/explore` with the shared filter, never the search `q` (the live
  // query rides back on its own, so a cleared search cannot reappear from a stale URL).
  const exploreReturn = $derived(
    resolve('/explore') + (routeFilter.current.search ? `?${routeFilter.current.search}` : ''),
  )

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
    createFocus = { center, minZoom: BLOCK_LABEL_ZOOM }
    readerClaimSeq += 1
  }}
/>

{#if searchBarShown}
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
        <Filter
          loading={explore.routes.phase.kind === 'loading'}
          phase={explore.routes.phase}
          routes={explore.routes.data}
        />
      {/snippet}
    </SearchBar>
  </div>
{/if}

<!-- Under the search bar, or in its slot under a sheet (placement's hint owns the top centre); centred
     on the uncovered map, beside the rail or the desktop sheet (left-27 plus max-w-sm / lg:max-w-md). -->
<PillHost
  class={[
    'fixed left-0 z-10 w-full',
    open && !searchBarShown ? 'top-2' : 'top-16',
    open && !searchBarShown ? 'md:pl-123 lg:pl-139' : 'md:pl-20',
  ]}
  surface={pill}
/>

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
