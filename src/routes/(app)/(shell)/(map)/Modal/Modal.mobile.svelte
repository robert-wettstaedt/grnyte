<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { BottomSheet, type TypeOfBottomSheet } from 'svelte-bottom-sheet'
  import { sheetState } from './sheetState.svelte'
  import type { ModalProps } from './types'

  let { children, onclose, open = $bindable() }: ModalProps = $props()

  let titleEl = $state<HTMLElement>()
  let contentEl = $state<HTMLElement>()
  let innerHeight = $state(window.innerHeight)
  let sheet = $state<ReturnType<TypeOfBottomSheet> | undefined>(undefined)

  function calc() {
    const titleHeight = titleEl?.clientHeight
    const contentHeight = contentEl?.parentElement?.parentElement?.clientHeight

    if (typeof window === 'undefined' || contentHeight == null || contentHeight === 0 || titleHeight == null) {
      return 0.75
    }

    return Number(Math.min((contentHeight + titleHeight) / innerHeight, 0.9).toFixed(2))
  }

  const titleSnapPoint = $derived.by(() => {
    const titleHeight = titleEl?.clientHeight

    if (!titleHeight) {
      return 0.1
    }

    return Number(Math.min(titleHeight / innerHeight, 0.3).toFixed(2))
  })

  const handleDocumentClick = (event: MouseEvent) => {
    if (!open || sheetState.requestSnap != null) return

    const target = event.target as HTMLElement

    if (!target.closest('.bottom-sheet')) {
      sheet?.setSnapPoint(titleSnapPoint)
    }
  }

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
</script>

<svelte:window bind:innerHeight />
<svelte:document onclick={handleDocumentClick} />

{#snippet content()}
  <BottomSheet.Sheet class="preset-filled-surface-50-950! block!">
    <BottomSheet.Handle style="background: var(--color-surface-50-950)" />

    <div
      bind:this={titleEl}
      class="preset-filled-surface-50-950 border-surface-100-900 sticky top-0 z-100 flex items-center justify-between gap-2 border-b-2 px-4 py-2"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        {#if sheetState.headerLeft}
          {@render sheetState.headerLeft()}
        {/if}

        <div class="flex min-w-0 flex-col">
          {#if sheetState.subtitle}
            {@render sheetState.subtitle()}
          {/if}

          {#if sheetState.title}
            {#if typeof sheetState.title === 'string'}
              <span class="text-lg">{sheetState.title}</span>
            {:else if sheetState.title != null}
              {@render sheetState.title()}
            {/if}
          {/if}
        </div>
      </div>

      <button
        class="btn-icon preset-filled-surface-200-800 shrink-0"
        aria-label={m.common_close()}
        onclick={(event) => {
          event.preventDefault()
          open = false
        }}
      >
        <Icon name="close" />
      </button>
    </div>

    <BottomSheet.Content class="w-full px-4!">
      <div bind:this={contentEl}>
        {@render children?.()}
      </div>
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<BottomSheet
  {onclose}
  bind:this={sheet}
  bind:isSheetOpen={open}
  settings={{
    closeThreshold: 0,
    disableClosing: true,
    maxHeight: 1,
    snapPoints: [titleSnapPoint, 0.25, 0.5, 0.75],
    startingSnapPoint: 0.75,
  }}
>
  {@render content()}
</BottomSheet>

<style>
  :global(.bottom-sheet-grip) {
    background: var(--color-surface-950-50) !important;
  }
</style>
