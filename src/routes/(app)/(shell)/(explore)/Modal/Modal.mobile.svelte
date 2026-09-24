<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import SiblingNav from '$lib/components/SiblingNav/SiblingNav.svelte'
  import { m } from '$lib/paraglide/messages'
  import { resetOnNavigate } from '$lib/state/scroll'
  import { BottomSheet, type TypeOfBottomSheet } from 'svelte-bottom-sheet'
  import SheetHeading from './SheetHeading.svelte'
  import { sheetState } from './sheetState.svelte'
  import type { ModalProps } from './types'

  // `back` (set by Panel for viewer routes) swaps the close X on the right for a
  // back arrow on the left, matching the desktop panel's header. `collapseOnOutsideClick`
  // is the map behaviour: a tap on the map drops the sheet to its title; viewer
  // routes turn it off so interacting with the stage leaves the sheet alone.
  let {
    back = false,
    children,
    collapseOnOutsideClick = true,
    onclose,
    open = $bindable(),
  }: ModalProps & { back?: boolean; collapseOnOutsideClick?: boolean } = $props()

  let titleEl = $state<HTMLElement>()
  let innerHeight = $state(window.innerHeight)
  let sheet = $state<ReturnType<TypeOfBottomSheet> | undefined>(undefined)

  // svelte-bottom-sheet re-fires `onclose` whenever its `settings` object changes while closed, and
  // ours is rebuilt on every `innerHeight` change. Fire only on a real open -> closed edge.
  let wasOpen = false

  // Parent effects run before the child's, so this beats BottomSheet's close.
  $effect(() => {
    if (open) {
      wasOpen = true
    }
  })

  const handleClose = () => {
    if (!wasOpen) return
    wasOpen = false
    onclose?.()
  }

  // Frame-relative top of the sheet, so floating controls and the page behind can track it.
  // From heights, not a rect: the open animation is a translateY a rect would measure wrong.
  $effect(() => {
    const sheetEl = titleEl?.closest('.bottom-sheet')
    if (sheetEl == null) return

    const frame = sheetEl.closest('[data-app-frame]') ?? document.documentElement
    const measure = () => (sheetState.sheetTop = frame.clientHeight - sheetEl.clientHeight)
    measure()
    // The frame too: the status bar shrinks it without resizing the sheet.
    const observer = new ResizeObserver(measure)
    observer.observe(sheetEl)
    observer.observe(frame)
    return () => {
      observer.disconnect()
      sheetState.sheetTop = null
    }
  })

  const titleSnapPoint = $derived.by(() => {
    if (!titleEl?.clientHeight) {
      return 0.1
    }

    const totalHeight = titleEl.offsetTop + titleEl.clientHeight
    return Number(Math.min(totalHeight / innerHeight, 0.3).toFixed(2))
  })

  const handleDocumentClick = (event: MouseEvent) => {
    if (!collapseOnOutsideClick || !open || sheetState.requestSnap != null) return

    const target = event.target as HTMLElement

    // A button inside the sheet that removes itself on click (e.g. a "Show all"
    // toggle) leaves `target` detached by the time this bubbles to the document,
    // so `.closest()` finds nothing and the sheet would wrongly collapse. A
    // detached node is never a real tap on the map behind the sheet: ignore it.
    if (!target.isConnected) return

    if (!target.closest('.bottom-sheet') && !target.closest('[data-sheet-floating]')) {
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
  <!-- The sheet element is the scroll container here: BottomSheet.Content clips instead. -->
  <BottomSheet.Sheet class="preset-filled-surface-50-950! block!" {@attach resetOnNavigate}>
    <BottomSheet.Handle style="background: var(--color-surface-50-950)" />

    <div
      bind:this={titleEl}
      class="preset-filled-surface-50-950 border-surface-100-900 sticky top-0 z-100 flex flex-col gap-2 border-b-2 px-4 py-2"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          {#if back}
            <button
              class="btn-icon preset-filled-surface-200-800 shrink-0"
              aria-label={m.common_back()}
              onclick={(event) => {
                event.preventDefault()
                open = false
              }}
            >
              <Icon name="arrow-left" />
            </button>
          {/if}

          <SheetHeading />
        </div>

        {#if !back}
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
        {/if}
      </div>

      {#if sheetState.toolbar}
        {@render sheetState.toolbar()}
      {/if}
    </div>

    <BottomSheet.Content class="w-full px-4!">
      {@render children?.()}
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<BottomSheet
  onclose={handleClose}
  bind:this={sheet}
  bind:isSheetOpen={open}
  settings={{
    closeThreshold: 0,
    disableClosing: true,
    maxHeight: 1,
    snapPoints: [titleSnapPoint, 0.25, 0.5, 0.75],
    startingSnapPoint: sheetState.startingSnap ?? 0.75,
  }}
>
  {@render content()}
</BottomSheet>

{#if open && sheetState.nav}
  {@const nav = sheetState.nav}
  <!-- Sibling of the sheet (not a child) so the sheet's `overflow` doesn't clip it.
       Sits just above the sheet's top edge and tracks it via `sheetState.sheetTop`. -->
  <div
    class="pointer-events-none fixed inset-x-0 z-60 flex -translate-y-full justify-start px-3 pb-2"
    style="top: {sheetState.sheetTop ?? 0}px"
    data-sheet-floating
  >
    <div
      class="border-surface-200-800 preset-filled-surface-100-900 pointer-events-auto flex items-center gap-1.5 rounded-2xl border p-1.5 shadow-lg"
    >
      <!-- Larger touch targets for the sheet pill; SiblingNav hides the keybind tooltips on touch itself. -->
      <SiblingNav {nav} large />
    </div>
  </div>
{/if}

<style>
  :global(.bottom-sheet-grip) {
    background: var(--color-surface-950-50) !important;
  }
</style>
