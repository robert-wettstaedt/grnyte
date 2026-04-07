<script lang="ts">
  import Logo from '$lib/assets/logo.svg'
  import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation'
  import { page } from '$app/state'
  import BottomSheetPanel, { sheetState } from '$lib/components/BottomSheetPanel'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import RoutesFilter from '$lib/components/RouteList/components/RoutesFilter'
  import { searchParamsSchema } from '$lib/components/RouteList/lib'
  import type { Geolocation } from '$lib/db/schema'
  import { queries } from '$lib/db/zero'
  import { validateObject } from '$lib/forms/validate.svelte'
  import { getI18n } from '$lib/i18n'
  import { fly } from 'svelte/transition'
  import Map, { type BlocksMapProps, type MapFocus, type NestedBlock } from '../map'
  import Search from '../search/Search.svelte'
  import type { LayoutProps } from './$types'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

  let { children }: LayoutProps = $props()

  const { t } = getI18n()

  let isDetailSheetOpen = $state(false)
  let isFilterSheetOpen = $state(false)
  let mapViewState = $state<{ center: [number, number]; zoom: number } | null>(null)
  let restoredFocus = $state<MapFocus | null>(null)

  beforeNavigate(() => {
    sheetState.title = ''
    sheetState.subtitle = null

    if (mapViewState != null) {
      replaceState('', $state.snapshot({ ...page.state, mapView: mapViewState }))
    }
  })

  afterNavigate((event) => {
    isDetailSheetOpen = !(event.to?.route.id?.endsWith('(modal)') ?? false)
    if (isDetailSheetOpen) {
      sheetState.requestSnap = 0.75
    }

    if (event.type === 'popstate' && page.state?.mapView != null) {
      restoredFocus = {
        center: page.state.mapView.center,
        zoom: page.state.mapView.zoom,
      }
    } else {
      restoredFocus = null
    }
  })

  const search = $derived(page.url.searchParams.toString())
  const searchParamsObj = $derived(Object.fromEntries(new URLSearchParams(search).entries()))
  const searchParams = $derived(validateObject(searchParamsSchema, searchParamsObj))

  const routesResult = $derived(page.data.z.q(queries.listRoutes({ ...searchParams, pageSize: undefined })))
  const blocksResult = $derived(page.data.z.q(queries.listBlocks({})))
  const areasResult = $derived(page.data.z.q(queries.listAreas({})))

  const data = $derived.by(() => {
    const areas = $state.snapshot(areasResult.data)

    const blocks = routesResult.data.map((route) => blocksResult.data.find((block) => block.id === route.blockFk))

    const nestedBlocks = blocks
      .map((block): NestedBlock | null => {
        if (block?.id == null) {
          return null
        }

        const parents: NestedBlock['area'][] = []
        let current = areas.find((area) => area.id === block.areaFk) as NestedBlock['area'] | undefined

        while (current != null) {
          let parent = areas.find((area) => area.id === current?.parentFk) as NestedBlock['area'] | undefined
          current.parent = parent ?? null
          parents.push(current)
          current = parent
        }

        return {
          ...block,
          createdAt: new Date(block.createdAt ?? 0),
          area: parents[0],
        } as NestedBlock
      })
      .filter((block) => block != null)

    const parkingLocations = areasResult.data.flatMap((area) => area.parkingLocations ?? []) as Geolocation[]
    const geoPaths = areasResult.data.flatMap((area) => area.geoPaths ?? [])
    const routeCountByBlock: globalThis.Map<number, number> = new globalThis.Map()

    for (const route of routesResult.data) {
      if (route.blockFk != null) {
        routeCountByBlock.set(route.blockFk, (routeCountByBlock.get(route.blockFk) ?? 0) + 1)
      }
    }

    return {
      blocks: nestedBlocks,
      parkingLocations,
      lineStrings: geoPaths,
      routeCountByBlock,
    } satisfies Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings' | 'routeCountByBlock'>
  })

  const focus: MapFocus | null = $derived.by(() => {
    const routeId = page.route.id ?? ''
    const bottomSheetPadding = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.75) : 0

    if (routeId.includes('blocks/')) {
      const blockId = Number(page.params.id)
      const block = data.blocks.find((b) => b.id === blockId)
      if (block?.geolocation) {
        return {
          center: [block.geolocation.lat, block.geolocation.long],
          zoom: 16,
          padding: [0, 0, bottomSheetPadding, 0],
        }
      }
    }

    if (routeId.includes('areas/')) {
      const areaId = Number(page.params.id)
      const areaBlocks = data.blocks.filter((b) => {
        let current: (NestedBlock['area'] & { parent: NestedBlock['area'] | null }) | null =
          b.area as NestedBlock['area'] & { parent: NestedBlock['area'] | null }
        while (current != null) {
          if (current.id === areaId) return true
          current = current.parent as (NestedBlock['area'] & { parent: NestedBlock['area'] | null }) | null
        }
        return false
      })
      const geoBlocks = areaBlocks.filter((b) => b.geolocation != null)
      if (geoBlocks.length > 0) {
        const lats = geoBlocks.map((b) => b.geolocation!.lat)
        const lngs = geoBlocks.map((b) => b.geolocation!.long)
        return {
          extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
          padding: [0, 0, bottomSheetPadding, 0],
        }
      }
    }

    return null
  })

  const effectiveFocus: MapFocus | null = $derived(focus ?? restoredFocus)
</script>

<Map {...data} focus={effectiveFocus} onviewchange={(view) => (mapViewState = view)} />

{#if !isDetailSheetOpen || page.route.id?.includes('/search')}
  <div
    class="absolute top-2 left-1/2 z-10 flex w-full -translate-x-1/2 gap-2 px-2"
    in:fly={{ y: -200 }}
    out:fly={{ y: -200 }}
  >
    <a href="/bla">
      <img class="min-h-9 min-w-9 rounded" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={36} height={36} />
    </a>

    <Search />

    <button
      class="btn btn-sm {isFilterSheetOpen ? 'preset-filled-primary-500' : 'preset-filled-surface-200-800'}"
      onclick={() => (isFilterSheetOpen = true)}
    >
      {#if routesResult.data.length === 0 && routesResult.details.type !== 'complete'}
        <LoadingIndicator class="flex justify-center" size={4} />
      {:else}
        <i class="fa-solid fa-filter"></i>
      {/if}
    </button>
  </div>
{/if}

{#if !isDetailSheetOpen}
  {@render children?.()}
{/if}

<BottomSheetPanel
  bind:isSheetOpen={isDetailSheetOpen}
  onclose={() => goto('/bla')}
  settings={{
    snapPoints: [0.25, 0.5, 0.75],
    maxHeight: 1,
    startingSnapPoint: 0.75,
    disableClosing: true,
    closeThreshold: 0,
  }}
>
  {@render children?.()}
</BottomSheetPanel>

<BottomSheetPanel bind:isSheetOpen={isFilterSheetOpen} title={t('common.filter')} autoHeight>
  <RoutesFilter numRoutes={routesResult.data.length} />
</BottomSheetPanel>
