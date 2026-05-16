<script lang="ts">
  import { getI18n } from '$lib/i18n'
  import { BottomSheet, type TypeOfBottomSheet } from 'svelte-bottom-sheet'
  import { sheetState } from './sheetState.svelte'

  const HANDLE_HEIGHT = 36

  type BottomSheetProps = Parameters<typeof BottomSheet>[1]

  interface Props extends BottomSheetProps {
    autoHeight?: boolean
    title?: string
    showOverlay?: boolean
  }

  let { autoHeight = false, children, isSheetOpen = $bindable(), showOverlay = false, title, ...rest }: Props = $props()

  const { t } = getI18n()

  let titleEl = $state<HTMLElement>()
  let contentEl = $state<HTMLElement>()
  let innerHeight = $state(window.innerHeight)
  let innerWidth = $state(window.innerWidth)
  let sheet = $state<ReturnType<TypeOfBottomSheet> | undefined>(undefined)

  const MD_BREAKPOINT_PX = 768
  const isMdUp = $derived(innerWidth >= MD_BREAKPOINT_PX)

  function calc() {
    const titleHeight = titleEl?.clientHeight
    const contentHeight = contentEl?.parentElement?.parentElement?.clientHeight

    if (
      !autoHeight ||
      typeof window === 'undefined' ||
      contentHeight == null ||
      contentHeight === 0 ||
      titleHeight == null
    ) {
      return 0.75
    }

    return Number(Math.min((contentHeight + HANDLE_HEIGHT + titleHeight) / innerHeight, 0.9).toFixed(2))
  }

  const maxHeight = $derived.by(calc)

  const titleSnapPoint = $derived.by(() => {
    const titleHeight = titleEl?.clientHeight

    if (!titleHeight) {
      return 0.1
    }

    return Number(Math.min((titleHeight + HANDLE_HEIGHT) / innerHeight, 0.3).toFixed(2))
  })

  const isNonClosable = $derived(rest.settings?.disableClosing === true)

  const handleDocumentClick = (event: MouseEvent) => {
    if (!isNonClosable || !isSheetOpen || sheetState.requestSnap != null) return

    const target = event.target as HTMLElement

    if (!target.closest('.bottom-sheet')) {
      sheet?.setSnapPoint(titleSnapPoint)
    }
  }

  $effect(() => {
    const snap = sheetState.requestSnap
    if (snap != null && sheet && isNonClosable) {
      // Use setTimeout to ensure the sheet's internal state has settled
      // (e.g. after a competing snap from handleDocumentClick)
      setTimeout(() => {
        sheet?.setSnapPoint(snap)
        sheetState.requestSnap = null
      }, 50)
    }
  })
</script>

<svelte:window bind:innerHeight bind:innerWidth />
<svelte:document onclick={handleDocumentClick} />

{#snippet content()}
  <BottomSheet.Sheet
    class="preset-filled-surface-50-950! block! max-w-md! md:top-12! md:right-auto! md:bottom-12! md:left-25! md:m-auto md:rounded-lg!"
  >
    {#if !isMdUp}
      <BottomSheet.Handle style="background: var(--color-surface-50-950)" />
    {/if}

    <div
      bind:this={titleEl}
      class="preset-filled-surface-50-950 sticky top-9 z-100 flex items-center justify-between p-2 shadow md:top-0 md:p-4"
    >
      <div class="flex flex-col">
        {#if sheetState.subtitle}
          {@render sheetState.subtitle()}
        {/if}

        {#if sheetState.title || title}
          {#if title}
            <span class="text-lg">{title}</span>
          {:else if typeof sheetState.title === 'string'}
            <span class="text-lg">{sheetState.title}</span>
          {:else if sheetState.title != null}
            {@render sheetState.title()}
          {/if}
        {/if}
      </div>

      <button
        class="btn-icon"
        aria-label={t('common.close')}
        onclick={(event) => {
          event.preventDefault()
          isSheetOpen = false
        }}
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <BottomSheet.Content class="w-full px-4! pt-0! md:px-6!">
      <div bind:this={contentEl}>
        {@render children()}
      </div>
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<BottomSheet
  {...rest}
  bind:this={sheet}
  settings={isMdUp
    ? {
        ...rest.settings,
        disableDragging: true,
        maxHeight: 0.9,
        snapPoints: [1],
      }
    : {
        maxHeight,
        ...rest.settings,
        snapPoints: isNonClosable
          ? [titleSnapPoint, ...(rest.settings?.snapPoints ?? [1])]
          : (rest.settings?.snapPoints ?? [1]),
      }}
  bind:isSheetOpen
>
  {#if showOverlay}
    <BottomSheet.Overlay class="backdrop-blur-xs">
      {@render content()}
    </BottomSheet.Overlay>
  {:else}
    {@render content()}
  {/if}
</BottomSheet>
