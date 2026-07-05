<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { canAddBlock, canAddParking } from '$lib/entities/area/permissions'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { BLOCK_LABEL_ZOOM } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { findNearestCrag } from './cragLocator'

  // The quick-create entry point on the /explore map: a FAB (shown only for editors,
  // zoomed in past the block-label level) opens a block/parking choice; picking one
  // enters placement mode — a fixed centre pin over the pannable map plus a confirm
  // card with the nearest crag prefilled. Confirming hands off to the existing add
  // pages with `?lat&long`, so all validation and persistence stays there.
  interface Props {
    /** Live map centre `[lat, lng]` from the layout's view tracking. */
    center: [number, number] | null
    zoom: number | null
    /** False while a detail sheet is open — hides the FAB. */
    visible: boolean
    /** Placement mode, bound so the layout can flip the map's pickMode and hide the search bar. */
    placing: 'block' | 'parking' | null
    /** Ask the layout to frame the map on a point (the long-press handoff). */
    onrequestcenter: (center: [number, number]) => void
  }

  let { center, zoom, visible, placing = $bindable(), onrequestcenter }: Props = $props()

  const global = getGlobalState()
  const areas = areaList()
  const blocks = blockList()

  let optionsOpen = $state(false)
  let pickerOpen = $state(false)
  let search = $state('')
  /** Manual override from the crag picker; wins over the proximity match. */
  let chosenCragId = $state<number | null>(null)

  const canCreate = $derived(global.userRegions.some((region) => region.permissions.includes(REGION_PERMISSION_EDIT)))
  const showFab = $derived(visible && canCreate && (zoom ?? 0) >= BLOCK_LABEL_ZOOM && placing == null)

  // Only blocks the user could have placed themselves anchor the proximity match.
  const editableBlocks = $derived(
    blocks.data.filter(
      (block) =>
        block.geolocation != null &&
        checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], block.regionFk),
    ),
  )

  const nearest = $derived(
    center == null || placing == null ? null : findNearestCrag(editableBlocks, { lat: center[0], long: center[1] }),
  )

  // Parking is stricter (needs an actual crag); blocks also allow still-untyped areas.
  const candidateCrags = $derived.by(() => {
    const allowed = placing === 'parking' ? canAddParking : canAddBlock
    return areas.data
      .filter((area) => allowed(global.userRegions, area))
      .toSorted((a, b) => a.name.localeCompare(b.name))
  })

  const filteredCrags = $derived(
    search.trim() === ''
      ? candidateCrags
      : candidateCrags.filter((area) => area.name.toLowerCase().includes(search.trim().toLowerCase())),
  )

  const resolvedCrag = $derived.by(() => {
    const id = chosenCragId ?? nearest?.cragId
    if (id == null) return null
    return candidateCrags.find((area) => area.id === id) ?? null
  })

  /** Long-press handoff from the layout: frame the pressed point, then offer the options. */
  export function openAt(point: [number, number]) {
    if (!canCreate) return
    onrequestcenter(point)
    optionsOpen = true
  }

  const startPlacing = (type: 'block' | 'parking') => {
    optionsOpen = false
    chosenCragId = null
    search = ''
    placing = type
  }

  const confirmCreate = () => {
    const crag = resolvedCrag
    if (crag == null || center == null || placing == null) return
    const path =
      placing === 'parking'
        ? resolve('/(app)/areas/[id]/parking/edit', { id: String(crag.id) })
        : resolve('/(app)/areas/[id]/blocks/add', { id: String(crag.id) })
    placing = null
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- path is pre-resolved above
    goto(`${path}?lat=${center[0]}&long=${center[1]}`)
  }

  // Matches LocationPicker's "48.41038°N, 2.61175°E" readout.
  const formatCoord = (coord: [number, number]): string =>
    `${Math.abs(coord[0]).toFixed(5)}°${coord[0] >= 0 ? 'N' : 'S'}, ${Math.abs(coord[1]).toFixed(5)}°${coord[1] >= 0 ? 'E' : 'W'}`
</script>

{#if placing == null}
  <Modal
    bind:open={optionsOpen}
    popoverProps={{ positioning: { placement: 'right-end' } }}
    snapPoints={[0.3]}
    title={m.map_create_title()}
  >
    {#snippet trigger(triggerProps)}
      <button
        {...triggerProps}
        aria-label={m.map_create_title()}
        class={[
          triggerProps.class,
          // Not btn-icon: its content-box sizing would add its padding on top of h-12/w-12.
          'preset-filled-primary-500 fixed bottom-20.5 left-2 z-20 flex h-12 w-12 items-center justify-center rounded-xl shadow-lg transition-opacity md:bottom-2 md:left-22',
          !showFab && 'pointer-events-none opacity-0',
        ]}
        onclick={() => (optionsOpen = !optionsOpen)}
      >
        <Icon name="plus" size={24} />
      </button>
    {/snippet}

    <div class="flex flex-col gap-1 py-2">
      <button
        class="hover:bg-surface-200-800 flex items-center gap-3 rounded-lg px-3 py-3"
        onclick={() => startPlacing('block')}
      >
        <Icon name="block" size={20} class="text-primary-500" />
        <span class="font-medium">{m.blocks_addBlock()}</span>
      </button>
      <button
        class="hover:bg-surface-200-800 flex items-center gap-3 rounded-lg px-3 py-3"
        onclick={() => startPlacing('parking')}
      >
        <Icon name="parking" size={20} class="text-primary-500" />
        <span class="font-medium">{m.areas_addParkingLocation()}</span>
      </button>
    </div>
  </Modal>
{:else}
  <!-- Placement mode: the picked location is the map centre; a fixed pin marks it. -->
  <div
    class="bg-surface-100-900/90 border-surface-300-700 text-surface-700-300 pointer-events-none fixed top-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap backdrop-blur"
  >
    <Icon name="navigation" size={13} class="text-primary-500" />
    {m.parking_mapHint()}
  </div>

  <div
    class="text-primary-500 pointer-events-none fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-full drop-shadow"
  >
    <Icon name="map-pin" size={40} fill="currentColor" />
  </div>

  <div
    class="bg-surface-100-900 border-surface-200-800 fixed bottom-22 left-1/2 z-20 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 flex-col gap-3 rounded-2xl border p-4 shadow-lg md:bottom-4"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="text-surface-600-400 text-[11px] font-bold tracking-wider uppercase">{m.map_create_crag()}</div>
        <Modal bind:open={pickerOpen} title={m.map_create_chooseCrag()}>
          {#snippet trigger(triggerProps)}
            <button
              {...triggerProps}
              class={[triggerProps.class, 'flex max-w-full items-center gap-1 truncate font-semibold']}
              onclick={() => (pickerOpen = !pickerOpen)}
            >
              <span class={['truncate', resolvedCrag == null && 'text-warning-600-400']}>
                {resolvedCrag?.name ?? m.map_create_noCragNearby()}
              </span>
              <Icon name="chevron-down" size={16} class="text-surface-600-400 shrink-0" />
            </button>
          {/snippet}

          <div class="flex flex-col gap-2 py-2">
            <input
              bind:value={search}
              class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-2.5 text-base focus:ring-0 focus:outline-none"
              placeholder={m.map_create_searchCrags()}
              type="search"
            />
            <div class="flex max-h-64 flex-col overflow-y-auto">
              {#each filteredCrags as crag (crag.id)}
                <button
                  class="hover:bg-surface-200-800 flex flex-col items-start rounded-lg px-3 py-2 text-left"
                  onclick={() => {
                    chosenCragId = crag.id
                    pickerOpen = false
                  }}
                >
                  <span class="font-medium">{crag.name}</span>
                  {#if crag.areas.length > 0}
                    <span class="text-surface-600-400 truncate text-xs">
                      {crag.areas.map((ancestor) => ancestor.name).join(' / ')}
                    </span>
                  {/if}
                </button>
              {:else}
                <span class="text-surface-500 px-3 py-2 text-sm">{m.map_create_noCragsFound()}</span>
              {/each}
            </div>
          </div>
        </Modal>
      </div>

      {#if center != null}
        <span class="text-surface-600-400 shrink-0 font-mono text-xs">{formatCoord(center)}</span>
      {/if}
    </div>

    <div class="flex gap-2">
      <button class="btn preset-tonal-surface flex-1" onclick={() => (placing = null)}>
        {m.common_cancel()}
      </button>
      <button class="btn preset-filled-primary-500 flex-1" disabled={resolvedCrag == null} onclick={confirmCreate}>
        {placing === 'parking' ? m.areas_addParkingLocation() : m.blocks_addBlock()}
      </button>
    </div>
  </div>
{/if}
