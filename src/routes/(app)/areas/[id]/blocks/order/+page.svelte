<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { reorderBlocks } from '$lib/entities/block/blocks.remote'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { canEditBlock } from '$lib/entities/block/permissions'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { haversineMetres, type Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { dndzone, type DndEvent } from 'svelte-dnd-action'
  import ReorderMap from './ReorderMap.svelte'

  const global = getGlobalState()
  const areaId = $derived(Number(page.params.id))
  const area = areaDetail(() => areaId)
  const blocks = blockList(() => ({ areaId }))

  // The working copy: seeded once from the live (order-asc) list, then owned locally so dragging
  // and auto-sort aren't clobbered by Zero updates. Nothing persists until Save.
  let staged = $state<BlockDetail[]>([])
  let initialized = false
  $effect(() => {
    if (!initialized && blocks.data.length > 0) {
      initialized = true
      staged = [...blocks.data]
    }
  })

  // Actual parking (the `P` pin) vs the sort reference (parking, else the block centroid).
  const parkingPoint = $derived.by<Coords | null>(() => {
    const parking = area.data?.parkingLocations.at(0)
    return parking == null ? null : { lat: parking.lat, long: parking.long }
  })
  const referencePoint = $derived.by<Coords | null>(() => {
    if (parkingPoint != null) return parkingPoint
    const coords = staged.map((block) => block.geolocation).filter((geo) => geo != null)
    if (coords.length === 0) return null
    return {
      lat: coords.reduce((sum, geo) => sum + geo.lat, 0) / coords.length,
      long: coords.reduce((sum, geo) => sum + geo.long, 0) / coords.length,
    }
  })

  const distanceTo = (ref: Coords, block: BlockDetail): number =>
    block.geolocation == null
      ? Number.POSITIVE_INFINITY
      : haversineMetres(ref, { lat: block.geolocation.lat, long: block.geolocation.long })

  // Seed the order by distance from the reference point. Just stages the result — nothing persists until Save.
  // Un-located blocks (infinite distance) settle at the bottom, stable among themselves.
  const sortByDistance = () => {
    const ref = referencePoint
    if (ref == null) return
    staged = [...staged].sort((a, b) => distanceTo(ref, a) - distanceTo(ref, b))
  }

  // map ↔ list selection sync: tap a pin or row to highlight it, scrolling the row into view.
  let listEl = $state<HTMLElement>()
  let selectedId = $state<number>()
  const select = (id: number) => (selectedId = id)
  $effect(() => {
    if (selectedId == null || listEl == null) return
    listEl.querySelector(`[data-block-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  // svelte-dnd-action handle pattern: drag is disabled until the grip is pressed, so the list
  // still scrolls on touch and only the handle starts a drag.
  let dragDisabled = $state(true)
  const grabHandle = (event: Event) => {
    event.preventDefault()
    dragDisabled = false
  }
  const grabHandleKey = (event: KeyboardEvent) => {
    if ((event.key === 'Enter' || event.key === ' ') && dragDisabled) dragDisabled = false
  }
  const consider = (event: CustomEvent<DndEvent<BlockDetail>>) => (staged = event.detail.items)
  const finalize = (event: CustomEvent<DndEvent<BlockDetail>>) => {
    staged = event.detail.items
    dragDisabled = true
  }

  let saving = $state(false)
  const save = async () => {
    saving = true
    try {
      await runCommand(reorderBlocks({ areaId, orderedIds: staged.map((block) => block.id) }))
    } finally {
      saving = false
    }
  }

  const cancel = () => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(areaId) }))
</script>

<svelte:head>
  <title>{m.blocks_order_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={area}>
  {#snippet ready(detail)}
    {#if !canEditBlock(global.userRegions, detail)}
      <ErrorState type="notfound" title={m.area_notFound()} />
    {:else}
      <div class="flex h-full flex-col">
        <header
          class="border-surface-200-800 bg-surface-50-950/90 sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur"
        >
          <button class="btn preset-tonal-surface" onclick={cancel} type="button">{m.common_cancel()}</button>
          <span class="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap">
            {m.blocks_order_title()}
          </span>
          <button class="btn preset-filled-primary-500" disabled={saving} onclick={save} type="button">
            {#if saving}<LoadingIndicator />{/if}
            {m.common_save()}
          </button>
        </header>

        <!-- Stacked on mobile (map over list); side-by-side on desktop (map left, list right). -->
        <div class="flex min-h-0 flex-1 flex-col md:flex-row-reverse">
          <div class="h-[42dvh] flex-none md:h-full md:flex-1">
            <ReorderMap blocks={staged} parking={parkingPoint} {selectedId} onselect={select} />
          </div>

          <div class="border-surface-200-800 flex min-h-0 flex-1 flex-col md:w-104 md:flex-none md:border-l">
            <div class="border-surface-200-800 flex flex-none items-center justify-between gap-3 border-b px-4 py-2.5">
              <span class="text-surface-600-400 text-xs">{m.blocks_order_hint()}</span>
              <button
                class="btn btn-sm preset-tonal-primary flex-none"
                disabled={referencePoint == null}
                onclick={sortByDistance}
                type="button"
              >
                <Icon name="navigation" size={15} />
                {m.blocks_order_sortByDistance()}
              </button>
            </div>

            <ul
              bind:this={listEl}
              class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-4"
              use:dndzone={{ items: staged, dragDisabled, flipDurationMs: 150, dropTargetStyle: {} }}
              onconsider={consider}
              onfinalize={finalize}
            >
              {#each staged as block, index (block.id)}
                <li
                  data-block-id={block.id}
                  class={[
                    'bg-surface-100-900 border-surface-200-800 flex items-center gap-3 rounded-xl border p-3',
                    block.id === selectedId && 'ring-primary-500 ring-2',
                  ]}
                >
                  <button
                    class="bg-primary-500/15 text-primary-500 flex size-8 flex-none items-center justify-center rounded-md text-sm font-bold tabular-nums"
                    onclick={() => select(block.id)}
                    type="button"
                    aria-label={m.blocks_order_select()}
                  >
                    {index + 1}
                  </button>

                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold">{block.name}</span>
                    {#if block.geolocation == null}
                      <span class="text-warning-500 flex items-center gap-1 text-xs">
                        <Icon name="alert-triangle" size={12} />
                        {m.blocks_noLocation()}
                      </span>
                    {/if}
                  </span>

                  <button
                    class="text-surface-500 hover:text-surface-950-50 flex-none cursor-grab touch-none p-1"
                    aria-label={m.blocks_order_drag()}
                    onmousedown={grabHandle}
                    ontouchstart={grabHandle}
                    onkeydown={grabHandleKey}
                  >
                    <Icon name="grip-vertical" size={18} />
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.area_notFound()} />
  {/snippet}
</QueryState>
