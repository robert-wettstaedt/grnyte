<script lang="ts">
  import { afterNavigate, beforeNavigate, goto, replaceState } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import Logo from '$lib/assets/logo.svg'
  import { searchParamsSchema } from '$lib/components/RouteList/lib'
  import type { Geolocation } from '$lib/db/schema'
  import { queries } from '$lib/db/zero'
  import { validateObject } from '$lib/forms/validate.svelte'
  import { fly } from 'svelte/transition'
  import Map, { type BlocksMapProps, type MapFocus, type NestedBlock } from '../Map'
  import type { LayoutProps } from './$types'
  import Filter from './Filter'
  import Modal, { sheetState } from './Modal'
  import SearchBar from './SearchBar'

  let { children }: LayoutProps = $props()

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

  afterNavigate((event) => {
    open = !(event.to?.route.id?.endsWith('(modal)') ?? false)
    if (open) {
      sheetState.requestSnap = event.to?.route.id?.includes('parking/') ? 0.25 : 0.75
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
    const areasById = new globalThis.Map(areas.map((area) => [area.id, area]))
    const blocksById = new globalThis.Map(blocksResult.data.map((block) => [block.id, block]))

    const nestedBlocks = routesResult.data
      .map((route): NestedBlock | null => {
        const block = route.blockFk != null ? blocksById.get(route.blockFk) : undefined
        if (block?.id == null) {
          return null
        }

        const parents: NestedBlock['area'][] = []
        let current = areasById.get(block.areaFk) as NestedBlock['area'] | undefined

        while (current?.parentFk != null) {
          let parent = areasById.get(current.parentFk) as NestedBlock['area'] | undefined
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

    if (routeId.includes('parking/')) {
      const parkingId = Number(page.params.id)
      const parking = data.parkingLocations.find((p) => p.id === parkingId)
      if (parking != null) {
        return {
          center: [parking.lat, parking.long],
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

<div use:fitHeightAction={{ paddingBottom: 0 }}>
  <Map {...data} focus={effectiveFocus} onviewchange={(view) => (mapViewState = view)} />
</div>

{#if !open || page.route.id?.includes('/search')}
  <div
    class="fixed top-2 left-0 z-10 flex w-full justify-center gap-2 px-1 md:left-27 md:w-sm md:px-0 lg:w-md"
    in:fly={{ y: -200 }}
    out:fly={{ y: -200 }}
  >
    <a class="md:hidden" href={resolve('/bla')}>
      <img class="min-h-9 min-w-9 rounded" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={36} height={36} />
    </a>

    <SearchBar />

    <Filter
      active={searchParams.maxGrade != null || searchParams.minGrade != null}
      loading={routesResult.data.length === 0 && routesResult.details.type !== 'complete'}
      numRoutes={routesResult.data.length}
    />
  </div>
{/if}

{#if !open}
  {@render children?.()}
{/if}

<Modal bind:open onclose={() => goto(resolve('/bla'))}>
  {@render children?.()}
</Modal>
