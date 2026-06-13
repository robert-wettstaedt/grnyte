<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import { fly } from 'svelte/transition'
  import type { LayoutProps } from './$types'
  import { queries } from '$lib/zero/queries'
  import { sheetState } from './Modal/sheetState.svelte'
  import Map, { type BlocksMapProps, type MapFocus } from './Map/Map.svelte'
  import { routeList, type AscentStatus, type RouteListFilter } from '$lib/entities/route/resources.svelte'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { userAscentList } from '$lib/entities/ascent/resources.svelte'
  import SearchBar from './SearchBar/SearchBar.svelte'
  import Filter from './Filter/Filter.svelte'
  import Modal from './Modal/Modal.svelte'
  import { getGlobalState } from '$lib/state/global.svelte'

  let { children }: LayoutProps = $props()

  const app = getGlobalState()

  let open = $state(!(page.route.id?.endsWith('(modal)') ?? false))
  let mapViewState = $state<{ center: [number, number]; zoom: number } | null>(null)
  let restoredFocus = $state<MapFocus | null>(null)

  beforeNavigate((navigation) => {
    if (navigation.from?.route.id !== navigation.to?.route.id) {
      sheetState.title = ''
      sheetState.subtitle = null
      sheetState.headerLeft = null
    }

    if (mapViewState != null) {
      replaceState('', $state.snapshot({ ...page.state, mapView: mapViewState }))
    }
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

  const search = $derived(page.url.searchParams.toString())
  const searchParams = $derived(Object.fromEntries(new URLSearchParams(search).entries()))

  // URL params are strings; the route query expects typed numbers.
  const routeFilter = $derived.by<RouteListFilter>(() => ({
    minGrade: searchParams.minGrade == null ? undefined : Number(searchParams.minGrade),
    maxGrade: searchParams.maxGrade == null ? undefined : Number(searchParams.maxGrade),
    minRating: searchParams.minRating == null ? undefined : Number(searchParams.minRating),
    tags: searchParams.tags ? searchParams.tags.split(',') : undefined,
    hasTopo: searchParams.hasTopo === '1' ? true : undefined,
    hasBeta: searchParams.hasBeta === '1' ? true : undefined,
  }))

  const routesResult = routeList(() => routeFilter)
  const blocksResult = blockList(() => ({}))
  const areasResult = areaList(() => ({}))

  // Ascent status is filtered client-side from the signed-in user's ascents
  // (Zero can't do `not(exists())`). The ascents only sync while the filter is
  // active.
  const ascentStatus = $derived.by<AscentStatus | undefined>(() => {
    const value = searchParams.ascentStatus
    return value === 'done' || value === 'todo' || value === 'project' ? value : undefined
  })

  const userAscents = userAscentList(
    () => app.user?.id,
    () => ascentStatus != null,
  )

  const ascentRouteIds = $derived.by(() => {
    const sent = new Set<number>()
    const attempted = new Set<number>()
    for (const ascent of userAscents.data) {
      if (ascent.type === 'attempt') {
        attempted.add(ascent.routeFk)
      } else {
        sent.add(ascent.routeFk)
      }
    }
    return { sent, attempted }
  })

  const visibleRoutes = $derived.by(() => {
    const routes = routesResult.data

    switch (ascentStatus) {
      case 'done':
        return routes.filter((route) => ascentRouteIds.sent.has(route.id))
      case 'todo':
        return routes.filter((route) => !ascentRouteIds.sent.has(route.id))
      case 'project':
        return routes.filter((route) => ascentRouteIds.attempted.has(route.id) && !ascentRouteIds.sent.has(route.id))
      default:
        return routes
    }
  })

  const routeCountByGrade = $derived.by(() => {
    const counts = new globalThis.Map<number, number>()
    for (const route of visibleRoutes) {
      if (route.gradeFk != null) {
        counts.set(route.gradeFk, (counts.get(route.gradeFk) ?? 0) + 1)
      }
    }
    return counts
  })

  const data = $derived.by(() => {
    const routeCountByBlock = new globalThis.Map<number, number>()
    for (const route of visibleRoutes) {
      if (route.blockFk != null) {
        routeCountByBlock.set(route.blockFk, (routeCountByBlock.get(route.blockFk) ?? 0) + 1)
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
    } satisfies Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings' | 'routeCountByBlock'>
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
    class="fixed top-2 left-0 z-10 flex w-full justify-center gap-2 px-1 md:left-27 md:w-sm md:px-0 lg:w-md"
    in:fly={{ y: -200 }}
    out:fly={{ y: -200 }}
  >
    <a class="md:hidden" href={resolve('/explore')}>
      <img class="min-h-9 min-w-9 rounded" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={36} height={36} />
    </a>

    <SearchBar />

    <Filter
      active={searchParams.maxGrade != null ||
        searchParams.minGrade != null ||
        searchParams.minRating != null ||
        searchParams.ascentStatus != null ||
        searchParams.tags != null ||
        searchParams.hasTopo != null ||
        searchParams.hasBeta != null}
      loading={routesResult.status === 'loading'}
      numRoutes={visibleRoutes.length}
      {routeCountByGrade}
    />
  </div>
{/if}

{#if !open}
  {@render children?.()}
{/if}

<Modal bind:open onclose={() => goto(resolve('/explore'))}>
  {@render children?.()}
</Modal>
