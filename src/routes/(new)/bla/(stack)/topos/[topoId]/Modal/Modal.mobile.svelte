<script lang="ts">
  import { selectedRouteStore } from '$lib/components/TopoViewer'
  import { getI18n } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { BottomSheet, type TypeOfBottomSheet } from 'svelte-bottom-sheet'
  import { sheetState } from './sheetState.svelte'
  import type { ModalProps } from './types'

  const HANDLE_HEIGHT = 36
  const STARTING_SNAP_POINT = 0.3

  let { base, children, title }: ModalProps = $props()

  const { t } = getI18n()

  let titleEl = $state<HTMLElement>()
  let innerHeight = $state(window.innerHeight)
  let sheet = $state<ReturnType<TypeOfBottomSheet> | undefined>(undefined)
  let snapPoint = $state<number>(STARTING_SNAP_POINT)

  const titleSnapPoint = $derived.by(() => {
    const titleHeight = titleEl?.clientHeight

    if (!titleHeight) {
      return 0.1
    }

    return Number(Math.min((titleHeight + HANDLE_HEIGHT) / innerHeight, 0.3).toFixed(2))
  })

  $effect(() => {
    const snap = sheetState.requestSnap
    if (snap != null && sheet) {
      // Use setTimeout to ensure the sheet's internal state has settled
      // (e.g. after a competing snap from handleDocumentClick)
      setTimeout(() => {
        sheet?.setSnapPoint(snap)
        sheetState.requestSnap = null
      }, 50)
    }
  })

  onMount(() => {
    let updates = 0

    return selectedRouteStore.subscribe((id) => {
      if (updates === 0) {
        return updates++
      }

      if (id == null) {
        sheet?.setSnapPoint(titleSnapPoint)
      } else if (snapPoint < STARTING_SNAP_POINT) {
        sheet?.setSnapPoint(STARTING_SNAP_POINT)
      }

      updates++
    })
  })
</script>

<svelte:window bind:innerHeight />

{@render base()}

{#snippet content()}
  <BottomSheet.Sheet class="preset-filled-surface-100-900! block!">
    <BottomSheet.Handle style="background: var(--color-surface-100-900)" />

    <div
      bind:this={titleEl}
      class="preset-filled-surface-100-900 sticky top-9 z-100 flex items-center justify-between p-2 shadow"
    >
      {@render title()}
    </div>

    <BottomSheet.Content class="mt-2 w-full p-0!">
      {@render children?.()}
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<BottomSheet
  bind:this={sheet}
  isSheetOpen
  onsnap={(snap) => (snapPoint = snap)}
  settings={{
    closeThreshold: 0,
    disableClosing: true,
    maxHeight: 1,
    snapPoints: [titleSnapPoint, 0.5, 0.4, 0.3, 0.2, 0.75],
    startingSnapPoint: STARTING_SNAP_POINT,
  }}
>
  {@render content()}
</BottomSheet>
