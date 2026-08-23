<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Image from '$lib/components/Image/Image.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import MenuRow from '$lib/components/MenuRow/MenuRow.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { TopoView } from '$lib/entities/topo/dto'
  import { m } from '$lib/paraglide/messages.js'
  import { flip } from 'svelte/animate'
  import { fade, fly } from 'svelte/transition'

  interface Props {
    currentTopoId: number | undefined
    onAddPhoto: () => void
    onDeletePhoto: () => void
    /** Persist a new photo order (called once a drag-reorder gesture settles). */
    onReorder: (orderedIds: number[]) => void
    onReplacePhoto: (topoId: number) => void
    onSelect: (topoId: number) => void
    /** An upload is in flight; disables the add button and shows a spinner. */
    photoBusy: boolean
    topos: Pick<TopoView, 'id' | 'imagePath'>[]
  }

  const { currentTopoId, onAddPhoto, onDeletePhoto, onReorder, onReplacePhoto, onSelect, photoBusy, topos }: Props =
    $props()

  let photoMenuOpen = $state(false)

  // Pointer-drag photo reorder state (works on touch).
  let reorderFrom = $state<number>()
  let reorderOver = $state<number>()
  let reorderActive = $state(false)
  let reorderStart = { x: 0, y: 0 }

  function onThumbPointerDown(event: PointerEvent, index: number) {
    reorderFrom = index
    reorderStart = { x: event.clientX, y: event.clientY }
    reorderActive = false
  }

  function onReorderMove(event: PointerEvent) {
    if (reorderFrom == null) return
    if (!reorderActive && Math.hypot(event.clientX - reorderStart.x, event.clientY - reorderStart.y) > 8) {
      reorderActive = true
    }
    if (!reorderActive) return
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-thumb-index]')
    reorderOver = el instanceof HTMLElement ? Number(el.dataset.thumbIndex) : undefined
  }

  function onReorderUp() {
    const from = reorderFrom
    const to = reorderOver
    const active = reorderActive
    reorderFrom = undefined
    reorderOver = undefined
    reorderActive = false
    if (!active || from == null || to == null || from === to) return

    const ids = topos.map((topo) => topo.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    onReorder(ids)
  }
</script>

<svelte:window onpointermove={onReorderMove} onpointerup={onReorderUp} />

<!-- Photo strip. Reorder is driven from the per-thumb grip handle (touch-none); the thumb body
   keeps touch-pan-x so a swipe scrolls the strip and a tap selects the photo. -->
<div class="pointer-events-auto flex items-start gap-2 overflow-x-auto pb-1">
  {#each topos as topo, index (topo.id)}
    <div class="flex shrink-0 flex-col items-center gap-1" animate:flip={{ duration: 200 }}>
      <div
        data-thumb-index={index}
        class={[
          'relative h-16 w-16 touch-pan-x overflow-hidden rounded-lg border-2 shadow-lg transition-opacity',
          topo.id === currentTopoId ? 'border-primary-500' : 'border-surface-50-950/60',
          reorderActive && index === reorderFrom && 'opacity-40',
          reorderActive && index === reorderOver && index !== reorderFrom && 'ring-primary-500 ring-2',
        ]}
        role="listitem"
      >
        <button
          type="button"
          class="h-full w-full"
          aria-label={m.topo_alt()}
          aria-pressed={topo.id === currentTopoId}
          onclick={() => onSelect(topo.id)}
        >
          <Image path={topo.imagePath} alt={m.topo_alt()} class="h-full w-full" fit="cover" previewWidth={256} />
        </button>

        <span
          class="bg-surface-950/55 pointer-events-none absolute bottom-1 left-1 rounded px-1 text-[0.65rem] font-bold text-white tabular-nums"
        >
          {index + 1}
        </span>

        {#if topo.id === currentTopoId}
          <Modal
            backdrop
            bind:open={photoMenuOpen}
            title={m.topo_position({ position: index + 1, total: topos.length })}
          >
            {#snippet trigger(props)}
              <button
                {...props}
                type="button"
                class="bg-surface-950/60 absolute top-1 right-1 flex size-6 items-center justify-center rounded-lg text-white shadow"
                aria-label={m.common_more()}
                title={m.common_more()}
                onpointerdown={(event) => event.stopPropagation()}
                onclick={(event) => {
                  event.stopPropagation()
                  photoMenuOpen = true
                }}
                transition:fade
              >
                <Icon name="more" size={15} />
              </button>
            {/snippet}

            <div class="flex flex-col gap-1 pb-2">
              <MenuRow
                icon="image"
                label={m.topo_replacePhoto()}
                description={m.topo_replacePhotoSub()}
                onclick={() => {
                  photoMenuOpen = false
                  onReplacePhoto(topo.id)
                }}
              />
              <MenuRow
                destructive
                icon="trash"
                label={m.topo_deletePhoto()}
                description={m.topo_deletePhotoSub()}
                onclick={() => {
                  photoMenuOpen = false
                  onDeletePhoto()
                }}
              />
            </div>
          </Modal>
        {/if}
      </div>

      <!-- Drag handle below the current thumb (keeps the thumbnail itself uncluttered). -->
      {#if topo.id === currentTopoId}
        <button
          type="button"
          class="bg-surface-950/60 flex h-6 w-16 cursor-grab touch-none items-center justify-center rounded-lg text-white shadow"
          aria-label={m.topo_dragToReorder()}
          title={m.topo_dragToReorder()}
          onpointerdown={(event) => onThumbPointerDown(event, index)}
          transition:fly={{ duration: 150, y: -12 }}
        >
          <Icon name="grip-horizontal" size={15} />
        </button>
      {/if}
    </div>
  {/each}

  <button
    type="button"
    class="border-surface-50-950/60 bg-surface-950/40 flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed text-white shadow-lg"
    aria-label={m.topo_addPhoto()}
    title={m.topo_addPhoto()}
    disabled={photoBusy}
    onclick={onAddPhoto}
  >
    {#if photoBusy}
      <LoadingIndicator class="items-center" />
    {:else}
      <Icon name="plus" size={18} />
      <span class="text-[0.6rem] font-bold tracking-wide uppercase">{m.common_add()}</span>
    {/if}
  </button>
</div>
