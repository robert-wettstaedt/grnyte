<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { trackHistoryDepth } from '$lib/state/navigation.svelte'
  import { fly } from 'svelte/transition'
  import type { LayoutProps } from './$types'
  import Filter from './Filter/Filter.svelte'
  import { parseRouteFilter } from './Filter/filter'
  import { filteredRouteList } from './Filter/filteredRoutes.svelte'
  import Map from './Map/Map.svelte'
  import type { BlocksMapProps, MapFocus } from './Map/types'
  import Modal from './Modal/Modal.svelte'
  import { sheetState } from './Modal/sheetState.svelte'
  import SearchBar from './SearchBar/SearchBar.svelte'
  import { SvelteMap } from 'svelte/reactivity'

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
  const filters = $derived(parseRouteFilter(page.url.searchParams))

  const routesResult = filteredRouteList(
    () => filters,
    () => global.user?.id,
  )
  const blocksResult = blockList(() => ({}))
  const areasResult = areaList(() => ({}))

  const data = $derived.by(() => {
    const routeCountByBlock = new SvelteMap<number, number>()
    const gradeCountByBlock = new SvelteMap<number, SvelteMap<number, number>>()
    for (const route of routesResult.data) {
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

  const focus: MapFocus | null = $derived.by(() => {
    const routeId = page.route.id ?? ''
    const bottomSheetPadding = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.75) : 0

    // if (routeId.includes('blocks/')) {
    //   const blockId = Number(page.params.id)
    //   const block = data.blocks.find((b) => b.id === blockId)
    //   if (block?.geolocation) {
    //     return {
    //       center: [block.geolocation.lat, block.geolocation.long],
    //       zoom: 16,
    //       padding: [0, 0, bottomSheetPadding, 0],
    //     }
    //   }
    // }

    // if (routeId.includes('parking/')) {
    //   const parkingId = Number(page.params.id)
    //   const parking = data.parkingLocations.find((p) => p.id === parkingId)
    //   if (parking != null) {
    //     return {
    //       center: [parking.lat, parking.long],
    //       zoom: 16,
    //       padding: [0, 0, bottomSheetPadding, 0],
    //     }
    //   }
    // }

    // if (routeId.includes('areas/')) {
    //   const areaId = Number(page.params.id)
    //   const areaBlocks = data.blocks.filter((b) => {
    //     let current: (NestedBlock['area'] & { parent: NestedBlock['area'] | null }) | null =
    //       b.area as NestedBlock['area'] & { parent: NestedBlock['area'] | null }
    //     while (current != null) {
    //       if (current.id === areaId) return true
    //       current = current.parent as (NestedBlock['area'] & { parent: NestedBlock['area'] | null }) | null
    //     }
    //     return false
    //   })
    //   const geoBlocks = areaBlocks.filter((b) => b.geolocation != null)
    //   if (geoBlocks.length > 0) {
    //     const lats = geoBlocks.map((b) => b.geolocation!.lat)
    //     const lngs = geoBlocks.map((b) => b.geolocation!.long)
    //     return {
    //       extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
    //       padding: [0, 0, bottomSheetPadding, 0],
    //     }
    //   }
    // }

    return null
  })

  const effectiveFocus: MapFocus | null = $derived(focus ?? restoredFocus)
</script>

<div class="absolute inset-0">
  <Map {...data} focus={effectiveFocus} onviewchange={(view) => (mapViewState = view)} />
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
        <Filter loading={routesResult.status === 'loading'} routes={routesResult.data} />
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
