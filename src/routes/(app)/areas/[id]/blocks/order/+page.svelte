<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import PageHeader from '$lib/components/PageHeader/PageHeader.svelte'
  import PageHeaderAction from '$lib/components/PageHeader/PageHeaderAction.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { reorderBlocks } from '$lib/entities/block/blocks.remote'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockName } from '$lib/entities/block/mapper'
  import { canEditBlock } from '$lib/entities/block/permissions'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { haversineMetres, type Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { runCommand } from '$lib/remote/mutation'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import {
    dragHandle,
    dragHandleZone,
    SHADOW_ITEM_MARKER_PROPERTY_NAME,
    TRIGGERS,
    type DndEvent,
  } from 'svelte-dnd-action'
  import { flip } from 'svelte/animate'
  import type { Attachment } from 'svelte/attachments'
  import { MediaQuery } from 'svelte/reactivity'
  import ReorderMap from './ReorderMap.svelte'

  const global = getGlobalState()
  const areaId = $derived(Number(page.params.id))
  const area = areaDetail(() => areaId)
  const blocks = blockList(() => ({ areaId }))

  // Cleared per area below: an id from the previous one matches no row, or an unrelated one.
  let selectedId = $state<number>()

  // The reader's ordering, or null while the live list is still doing the ordering.
  let staged = $state<BlockDetail[] | null>(null)

  // Whether a drag is in flight, which decides who owns `staged` (see `list`).
  let dragging = $state(false)
  // The block the shadow stands for, so `ordered` can put it back (see below).
  let draggedId = $state<number>()

  // svelte-dnd-action's stand-in for the row being dragged: a copy of it under a string id.
  const isDndShadow = (block: BlockDetail) => SHADOW_ITEM_MARKER_PROPERTY_NAME in block

  // Zero under reduced motion. Shared with the zone, which needs the same number.
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)

  // Which ids the live list has already carried, so a row knows whether it just synced in. Reset
  // per area here, not in `seedOnKeyChange`, whose effect order against this one is unspecified.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a ledger, not UI state
  const seen = new Set<number>()
  let seenArea = -1
  let primed = false
  $effect(() => {
    if (seenArea !== areaId) {
      seen.clear()
      seenArea = areaId
      primed = false
    }
    // An empty first snapshot must not prime, or the whole list reads as arrivals a tick later.
    if (blocks.data.length === 0) return
    for (const block of blocks.data) seen.add(block.id)
    primed = true
  })

  // Judged against `blocks.data`, not the rendered list: a drag swaps the row out for the shadow
  // and back, so every drop would flash. An attachment because the library's README warns off
  // Svelte transitions, and opacity only because `animate:flip` owns `transform` here.
  const fadeInIfNew =
    (block: BlockDetail): Attachment =>
    (node) => {
      if (!primed || seenArea !== areaId || duration === 0) return
      if (isDndShadow(block) || seen.has(block.id)) return
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease-out' })
    }

  // What the drop zone renders. Mid-drag the library owns this array and reads back whatever we
  // render as the drop result, so it is handed over untouched. Otherwise: the reader's order,
  // plus anything that arrived since, minus anything deleted.
  const list = $derived.by(() => {
    const live = blocks.data
    if (staged == null) return live
    if (dragging) return staged
    // Mapped back onto the live rows: a block moved before a rename landed would hold the old copy.
    const byId = new Map(live.map((block) => [block.id, block]))
    const kept = staged.flatMap((block) => byId.get(block.id) ?? [])
    const keptIds = new Set(kept.map((block) => block.id))
    return [...kept, ...live.filter((block) => !keptIds.has(block.id))]
  })

  // The same order with the placeholder resolved back to the block it stands for. Dropping it
  // instead left the list a row short mid-drag, so the map refitted and the centroid moved.
  const ordered = $derived(
    list.flatMap((block) => {
      if (!isDndShadow(block)) return [block]
      // Dropped when the id is unknown: the placeholder's id is a string, which `orderedIds`
      // rejects, losing the whole reorder to a generic error.
      return draggedId == null ? [] : [{ ...block, id: draggedId }]
    }),
  )

  // Cleared on the area, not on its rows arriving: waiting leaves the old list under the new URL.
  seedOnKeyChange(
    () => areaId,
    () => {
      staged = null
      selectedId = undefined
      dragging = false
      draggedId = undefined
    },
  )

  // Actual parking (the `P` pin) vs the sort reference (parking, else the block centroid).
  const parkingPoint = $derived.by<Coords | null>(() => {
    const parking = area.data?.parkingLocations.at(0)
    return parking == null ? null : { lat: parking.lat, long: parking.long }
  })
  const referencePoint = $derived.by<Coords | null>(() => {
    if (parkingPoint != null) return parkingPoint
    const coords = ordered.map((block) => block.geolocation).filter((geo) => geo != null)
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

  // Seed the order by distance. Un-located blocks settle at the bottom, stable among themselves.
  //
  // KNOWN GAP, accepted: a drag stays true of a subset, but sorting is a claim about every block,
  // so on a partial snapshot it interleaves sorted rows with ones the reader never saw. Left
  // ungated because `isComplete` goes false whenever the socket parks, which killed the button.
  // The row labels ("Block <index + 1>") carry the same gap from the other end.
  const sortByDistance = () => {
    const ref = referencePoint
    if (ref == null) return
    staged = [...ordered].sort((a, b) => distanceTo(ref, a) - distanceTo(ref, b))
  }

  // map ↔ list selection sync: tap a pin or row to highlight it, scrolling the row into view.
  let listEl = $state<HTMLElement>()
  const select = (id: number) => (selectedId = id)
  $effect(() => {
    if (selectedId == null || listEl == null) return
    listEl.querySelector(`[data-block-id="${selectedId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })

  // Drag starts only from the grip, so the list still scrolls on touch. `dragHandle` rather than
  // a `dragDisabled` prop of our own: it flips the library's store synchronously, so the zone's
  // listeners are attached while the press that armed them is still bubbling. A Svelte `$state`
  // latch updates a tick too late, which cost the whole first press (the list dragged only on the
  // second) and left the keyboard zone detached, so the arrows scrolled the list instead of
  // reordering it. It also focuses the grip and gives it `role="button"`.
  const consider = (event: CustomEvent<DndEvent<BlockDetail>>) => {
    // A keyboard drag ends on a consider carrying DRAG_STOPPED, with no finalize after it, so the
    // flag has to come down here too. Latched on, `list` hands back `staged` verbatim for the rest
    // of the visit: a block syncing in afterwards never renders and never reaches Save, a block
    // someone else deletes stays, and later renames are ignored.
    dragging = event.detail.info.trigger !== TRIGGERS.DRAG_STOPPED
    draggedId = typeof event.detail.info.id === 'number' ? event.detail.info.id : undefined
    staged = event.detail.items
  }
  const finalize = (event: CustomEvent<DndEvent<BlockDetail>>) => {
    dragging = false
    staged = event.detail.items
  }

  let saving = $state(false)
  const save = async () => {
    saving = true
    try {
      await runCommand(reorderBlocks({ areaId, orderedIds: ordered.map((block) => block.id) }))
    } finally {
      saving = false
    }
  }

  const cancel = () => back(resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(areaId) }))
</script>

<svelte:head>
  <title>{m.blocks_order_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={area} class="h-full">
  {#snippet ready(detail)}
    {#if !canEditBlock(global.userRegions, detail)}
      <ErrorState
        type="generic"
        title={m.form_noPermission()}
        description={m.form_noEditPermission()}
        primaryAction={{
          href: resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: String(areaId) }),
          label: m.areas_viewArea(),
        }}
      />
    {:else}
      <div class="flex h-full flex-col">
        <PageHeader backLabel={m.common_cancel()} onback={cancel} title={m.blocks_order_title()}>
          {#snippet action()}
            <PageHeaderAction disabled={saving} label={m.common_save()} onclick={save} pending={saving} />
          {/snippet}
        </PageHeader>

        <!-- Stacked on mobile (map over list); side-by-side on desktop (map left, list right). -->
        <div class="flex min-h-0 flex-1 flex-col md:flex-row">
          <div class="h-[42dvh] flex-none md:h-full md:flex-1">
            <!-- Rebuilt per area so the fit starts over: it tracks what it last framed and
                 whether the reader has taken the view, and neither belongs to the next area. -->
            {#key areaId}
              <ReorderMap
                blocks={ordered}
                parking={parkingPoint}
                geoPaths={detail.geoPaths}
                {selectedId}
                onselect={select}
              />
            {/key}
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
              use:dragHandleZone={{ dropTargetStyle: {}, flipDurationMs: duration, items: list }}
              onconsider={consider}
              onfinalize={finalize}
            >
              {#each list as block, index (block.id)}
                <li
                  data-block-id={block.id}
                  class={[
                    'bg-surface-100-900 border-surface-200-800 flex items-center gap-3 rounded-xl border p-3',
                    block.id === selectedId && 'ring-primary-500 ring-2',
                  ]}
                  animate:flip={{ duration }}
                  {@attach fadeInIfNew(block)}
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
                    <!-- Named off the list position, not the stored slot: a nameless block falls
                         back to "Block <n>", and mid-drag its slot is whatever it was before the
                         drag started, so the label read one number while the badge beside it read
                         another. Only the badge: the map pins number off `ordered`, which drops
                         the drag placeholder when its id is unknown, so in that one window the
                         dragged block has no pin at all and the rows BELOW it sit one ahead of the
                         pins that remain. -->
                    <span class="block truncate font-semibold">{blockName(block.rawName, index)}</span>
                    {#if block.geolocation == null}
                      <span class="text-warning-800-200 flex items-center gap-1 text-xs">
                        <Icon name="alert-triangle" size={12} />
                        {m.blocks_noLocation()}
                      </span>
                    {/if}
                  </span>

                  <!-- A span, not a button: the library refuses to start a drag when the press
                       lands on an element carrying a `value` property, which is how it avoids
                       stealing presses from selects and inputs, and `HTMLButtonElement.value` is
                       ''. Pressing the grip did nothing; only a press that happened to land on the
                       glyph inside it got through.

                       No role or tabindex here: `dragHandle` sets `role="button"` and drives
                       tabindex itself, taking the handle out of the tab order for the length of a
                       drag. Spelling them in the markup only sets a pre-hydration value the action
                       immediately overwrites, while reading as though this file owned them. -->
                  <span
                    class="text-surface-500 hover:text-surface-950-50 flex-none touch-none p-1"
                    aria-label={m.blocks_order_drag()}
                    use:dragHandle
                  >
                    <Icon name="grip-vertical" size={18} />
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.areas_notFound()} />
  {/snippet}
</QueryState>
