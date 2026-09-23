<script lang="ts">
  import { resolve } from '$app/paths'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { AreaListItem } from '$lib/entities/area/dto'
  import { canAddArea, canAddBlock, canAddParking } from '$lib/entities/area/permissions'
  import { areaList } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { regionDisplayName } from '$lib/entities/region/mapper'
  import { nameCollator } from '$lib/i18n/collator'
  import { formatCoord, formatMetres } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { push } from '$lib/state/navigation.svelte'
  import { ancestorDistances, findNearestSector, sectorDistances } from './sectorLocator'

  // The create entry point on the /explore map: a FAB (editors only) opens the region's create
  // menu. An area is made straight away; a block or a parking spot enters placement mode, a fixed
  // centre pin over the pannable map plus a confirm card with the nearest sector prefilled.
  // Confirming hands off to the existing add pages with `?lat&long`, so all validation and
  // persistence stays there.
  interface Props {
    /** Live map centre `[lat, lng]` from the layout's view tracking. */
    center: [number, number] | null
    /** Ask the layout to frame the map on a point (the long-press handoff, and entering placement). */
    onrequestcenter: (center: [number, number]) => void
    /** Placement mode, bound so the layout can flip the map's pickMode and hide the search bar. */
    placing: 'block' | 'parking' | null
    /** False while a detail sheet is open, hides the FAB. */
    visible: boolean
  }

  let { center, onrequestcenter, placing = $bindable(), visible }: Props = $props()

  const global = getGlobalState()
  const areas = areaList()
  const blocks = blockList()

  let optionsOpen = $state(false)
  let pickerOpen = $state(false)
  let areaPickerOpen = $state(false)
  let search = $state('')
  let areaSearch = $state('')
  /** Manual override from the sector picker; wins over the proximity match. */
  let chosenSectorId = $state<null | number>(null)

  const canCreate = $derived(global.userRegions.some((region) => region.permissions.includes(REGION_PERMISSION_EDIT)))

  // No zoom gate on the FAB: confirming a pin while a pixel covers kilometres is what `startPlacing`
  // guards against by framing the map first. A rough pin is a first-class thing here anyway:
  // `geolocations.estimated` exists, and photo EXIF writes one on purpose.
  const showFab = $derived(visible && canCreate && placing == null)

  // One row per region, each naming its destination: areas cannot be re-parented.
  const addableRegions = $derived(
    global.userRegions.filter((region) => canAddArea(global.userRegions, { regionFk: region.regionFk, type: 'area' })),
  )

  // Only blocks the user could have placed themselves anchor the proximity match.
  const editableBlocks = $derived(
    blocks.data.filter(
      (block) =>
        block.geolocation != null &&
        checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], block.regionFk),
    ),
  )

  const nearest = $derived(
    center == null || placing == null ? null : findNearestSector(editableBlocks, { lat: center[0], long: center[1] }),
  )

  // Parking is stricter (needs an actual sector); blocks also allow still-untyped areas.
  const candidateSectors = $derived.by(() => {
    const allowed = placing === 'parking' ? canAddParking : canAddBlock
    const byName = nameCollator()
    return areas.data
      .filter((area) => allowed(global.userRegions, area))
      .toSorted((a, b) => byName.compare(a.name, b.name))
  })

  const filteredSectors = $derived(
    search.trim() === ''
      ? candidateSectors
      : candidateSectors.filter((area) => area.name.toLowerCase().includes(search.trim().toLowerCase())),
  )

  // From the pin, not the reader: it is the subject here, and what `nearest` prefills from. Frozen
  // at open, or the map moving behind the sheet would reorder rows under a scrolling finger.
  let distances = $state(new Map<number, number>())

  // Nearest first; sectors with no distance keep their alphabetical place under their own heading.
  const locatedSectors = $derived(
    filteredSectors
      .filter((area) => distances.has(area.id))
      .toSorted((a, b) => distances.get(a.id)! - distances.get(b.id)!),
  )
  const unlocatedSectors = $derived(filteredSectors.filter((area) => !distances.has(area.id)))

  // What can hold a sub-area; `canAddArea` refuses a sector.
  const candidateAreas = $derived.by(() => {
    const byName = nameCollator()
    return areas.data
      .filter((area) => canAddArea(global.userRegions, area))
      .toSorted((a, b) => byName.compare(a.name, b.name))
  })

  const matchesAreaSearch = (name: string) => name.toLowerCase().includes(areaSearch.trim().toLowerCase())

  const filteredAreas = $derived(
    areaSearch.trim() === '' ? candidateAreas : candidateAreas.filter((area) => matchesAreaSearch(area.name)),
  )

  /** Frozen at open, lifted from the sectors beneath each area. */
  let areaDistances = $state(new Map<number, number>())

  const locatedAreas = $derived(
    filteredAreas
      .filter((area) => areaDistances.has(area.id))
      .toSorted((a, b) => areaDistances.get(a.id)! - areaDistances.get(b.id)!),
  )
  const unlocatedAreas = $derived(filteredAreas.filter((area) => !areaDistances.has(area.id)))

  // Only while searching: unprompted, every sector would bury the pressable rows.
  const blockedSectors = $derived(
    areaSearch.trim() === ''
      ? []
      : areas.data.filter(
          (area) =>
            area.type === 'sector' &&
            matchesAreaSearch(area.name) &&
            checkRegionPermission(global.userRegions, [REGION_PERMISSION_EDIT], area.regionFk),
        ),
  )

  const resolvedSector = $derived.by(() => {
    const id = chosenSectorId ?? nearest?.sectorId
    if (id == null) return null
    return candidateSectors.find((area) => area.id === id) ?? null
  })

  /** The point a long press asked for, until placement uses it. Not `center`: that only catches up
   *  when the map reports the move back, and the options sheet opens long before the fly-to
   *  settles, so re-framing on `center` yanked the map back to wherever they were looking before
   *  the press and dropped the pin there. */
  let pressed = $state<[number, number] | null>(null)

  /** Long-press handoff from the layout: frame the pressed point, then offer the options. */
  export function openAt(point: [number, number]) {
    if (!canCreate) return
    pressed = point
    onrequestcenter(point)
    optionsOpen = true
  }

  // `startPlacing` clears the search once per placement, but the picker opens repeatedly
  // within one: without this, a term typed to find the last sector still filters the list on
  // the next open, and a sector that is right there reads as "no sectors found".
  const togglePicker = () => {
    if (!pickerOpen) {
      search = ''
      distances = center == null ? new Map() : sectorDistances(editableBlocks, { lat: center[0], long: center[1] })
    }
    pickerOpen = !pickerOpen
  }

  const openAreaPicker = () => {
    optionsOpen = false
    areaSearch = ''
    // The same subject the sector picker measures from.
    const point = pressed ?? center
    areaDistances =
      point == null
        ? new Map()
        : ancestorDistances(sectorDistances(editableBlocks, { lat: point[0], long: point[1] }), areas.data)
    areaPickerOpen = true
  }

  const chooseArea = (id: number) => {
    areaPickerOpen = false
    push(resolve('/(app)/areas/[id]/add', { id: String(id) }))
  }

  const startPlacing = (type: 'block' | 'parking') => {
    optionsOpen = false
    chosenSectorId = null
    search = ''
    // Frame the map at pin-dropping zoom before handing over the centre pin: zoomed out, the pin
    // means nothing and `findNearestSector` would match something continents away.
    const target = pressed ?? center
    if (target != null) {
      onrequestcenter(target)
    }
    placing = type
  }

  const confirmCreate = () => {
    const sector = resolvedSector
    if (sector == null || center == null || placing == null) return
    const path =
      placing === 'parking'
        ? resolve('/(app)/areas/[id]/parking/edit', { id: String(sector.id) })
        : resolve('/(app)/areas/[id]/blocks/add', { id: String(sector.id) })
    placing = null

    push(`${path}?lat=${center[0]}&long=${center[1]}`)
  }
</script>

<!-- `Row` rather than `AreaRow`, which would put a thumbnail on every one. `tabular-nums` is what
     makes the distances read as a ranking. -->
{#snippet optionRow(item: AreaListItem, metres: number | undefined, onclick: () => void)}
  <Row crumbs={item.areas.map((ancestor) => ancestor.name)} {onclick} title={item.name} variant="option">
    {#snippet rightContent()}
      {#if metres != null}
        <span class="text-surface-500 shrink-0 text-[11px] font-semibold tabular-nums">{formatMetres(metres)}</span>
      {/if}
    {/snippet}
  </Row>
{/snippet}

{#snippet sectorRow(sector: AreaListItem)}
  {@render optionRow(sector, distances.get(sector.id), () => {
    chosenSectorId = sector.id
    pickerOpen = false
  })}
{/snippet}

{#snippet areaRow(area: AreaListItem)}
  {@render optionRow(area, areaDistances.get(area.id), () => chooseArea(area.id))}
{/snippet}

<!-- Inert on purpose: nothing to press, it only says why the sector is missing. -->
{#snippet blockedSectorRow(sector: AreaListItem)}
  <div class="flex flex-col px-3 py-2">
    <span class="text-surface-600-400 truncate text-sm font-medium">{sector.name}</span>
    <span class="text-surface-500 text-xs">{m.areas_holdsBlocks()}</span>
  </div>
{/snippet}

{#if placing == null}
  <Modal
    bind:open={optionsOpen}
    popoverProps={{ positioning: { placement: 'right-end' } }}
    snapPoints={[0.45]}
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
        onclick={() => {
          // Opened from the button, so there is no pressed point: placement frames on the map's
          // own centre, not on a long press from earlier in the session.
          pressed = null
          optionsOpen = !optionsOpen
        }}
      >
        <Icon name="plus" size={24} />
      </button>
    {/snippet}

    <!-- Sectioned the way the area-level MoreMenu is: an area joins the region and needs no pin,
         a block and a parking spot are placed on the map. Without the split, "area" here reads as
         "sub-area" and quietly makes a top-level one. -->
    <div class="flex flex-col gap-1 py-2">
      <h3 class="text-surface-500 px-1 pt-1 pb-1 text-xs font-bold tracking-wider uppercase">
        {m.map_create_regionSection()}
      </h3>

      <!-- eslint-disable svelte/no-navigation-without-resolve -- resolve()'d above, plus a query string -->
      {#each addableRegions as region (region.regionFk)}
        <a
          class="hover:bg-surface-200-800 flex items-center gap-3 rounded-lg px-3 py-3"
          href={`${resolve('/(app)/areas/add')}?regionFk=${region.regionFk}`}
          onclick={() => (optionsOpen = false)}
        >
          <Icon name="area" size={20} class="text-primary-500" />
          <span class="font-medium">{m.areas_newAreaIn({ name: regionDisplayName(region) })}</span>
        </a>
      {/each}
      <!-- eslint-enable svelte/no-navigation-without-resolve -->

      <!-- Hidden when nothing can hold a sub-area: the row above is then the only move. -->
      {#if candidateAreas.length > 0}
        <button class="hover:bg-surface-200-800 flex items-center gap-3 rounded-lg px-3 py-3" onclick={openAreaPicker}>
          <Icon name="area" size={20} class="text-primary-500" />
          <span class="font-medium">{m.map_create_areaInsideArea()}</span>
          <Icon name="chevron-right" size={16} class="text-surface-600-400 ml-auto" />
        </button>
      {/if}

      <h3 class="text-surface-500 px-1 pt-3 pb-1 text-xs font-bold tracking-wider uppercase">
        {m.map_create_mapSection()}
      </h3>

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

  <!-- Panel, not popover: the row that opens this is gone by then, so a popover would anchor to
       an empty button Zag renders in its place. Triggerless is legal in panel mode only. -->
  <Modal
    backdrop
    bind:open={areaPickerOpen}
    contentClass="w-full max-w-sm max-h-[80dvh]"
    panel
    panelClass="fixed inset-0 z-60 flex items-center justify-center p-4"
    title={m.map_create_chooseArea()}
  >
    <div class="flex flex-col gap-2 py-2">
      <input
        bind:value={areaSearch}
        class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-2.5 text-base focus:ring-0 focus:outline-none"
        placeholder={m.map_create_searchAreas()}
        type="search"
      />
      <div class="flex max-h-64 flex-col overflow-y-auto">
        {#each locatedAreas as area (area.id)}
          {@render areaRow(area)}
        {/each}

        <!-- Only a heading when both groups are populated: on its own, the tail IS the list. -->
        {#if locatedAreas.length > 0 && unlocatedAreas.length > 0}
          <h3 class="text-surface-500 px-1 pt-3 pb-1 text-xs font-bold tracking-wider uppercase">
            {m.map_create_withoutLocation()}
          </h3>
        {/if}

        {#each unlocatedAreas as area (area.id)}
          {@render areaRow(area)}
        {/each}

        {#each blockedSectors as sector (sector.id)}
          {@render blockedSectorRow(sector)}
        {/each}

        {#if filteredAreas.length === 0 && blockedSectors.length === 0}
          <span class="text-surface-600-400 px-3 py-2 text-sm">{m.map_create_noAreasFound()}</span>
        {/if}
      </div>
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
        <div class="text-surface-600-400 text-[11px] font-bold tracking-wider uppercase">{m.map_create_sector()}</div>
        <Modal bind:open={pickerOpen} title={m.map_create_chooseSector()}>
          {#snippet trigger(triggerProps)}
            <button
              {...triggerProps}
              class={[triggerProps.class, 'flex max-w-full items-center gap-1 truncate font-semibold']}
              onclick={togglePicker}
            >
              <span class={['truncate', resolvedSector == null && 'text-warning-600-400']}>
                {resolvedSector?.name ?? m.map_create_noSectorNearby()}
              </span>
              <Icon name="chevron-down" size={16} class="text-surface-600-400 shrink-0" />
            </button>
          {/snippet}

          <div class="flex flex-col gap-2 py-2">
            <input
              bind:value={search}
              class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-2.5 text-base focus:ring-0 focus:outline-none"
              placeholder={m.map_create_searchSectors()}
              type="search"
            />
            <div class="flex max-h-64 flex-col overflow-y-auto">
              {#each locatedSectors as sector (sector.id)}
                {@render sectorRow(sector)}
              {/each}

              <!-- Only a heading when both groups are populated: on its own, the tail IS the list. -->
              {#if locatedSectors.length > 0 && unlocatedSectors.length > 0}
                <h3 class="text-surface-500 px-1 pt-3 pb-1 text-xs font-bold tracking-wider uppercase">
                  {m.map_create_withoutLocation()}
                </h3>
              {/if}

              {#each unlocatedSectors as sector (sector.id)}
                {@render sectorRow(sector)}
              {/each}

              {#if filteredSectors.length === 0}
                <span class="text-surface-600-400 px-3 py-2 text-sm">{m.map_create_noSectorsFound()}</span>
              {/if}
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
      <button class="btn preset-filled-primary-500 flex-1" disabled={resolvedSector == null} onclick={confirmCreate}>
        {placing === 'parking' ? m.areas_addParkingLocation() : m.blocks_addBlock()}
      </button>
    </div>
  </div>
{/if}
