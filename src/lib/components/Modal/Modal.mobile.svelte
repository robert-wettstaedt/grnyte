<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Portal } from '@skeletonlabs/skeleton-svelte'
  import { BottomSheet } from 'svelte-bottom-sheet'
  import type { Props } from './types'

  let {
    backdrop = false,
    children,
    footer,
    headerLeft,
    headerRight,
    nested = false,
    open = $bindable(),
    snapPoints = [0.5],
    subtitle,
    title,
    trigger,
  }: Props = $props()

  // Keep the sheet (and the focused field) above the on-screen keyboard.
  //
  // svelte-bottom-sheet anchors the sheet to `bottom: 0` of the *layout* viewport
  // and sizes it from `window.innerHeight`. On Android, the `interactive-widget=
  // resizes-content` viewport hint shrinks the layout viewport when the keyboard
  // opens, so the library reflows the sheet for free. iOS Safari ignores that hint
  // and only shrinks the *visual* viewport, trapping the sheet behind the keyboard.
  // So we measure the keyboard overlap ourselves and lift the sheet by it via the
  // `--keyboard-inset` custom property (consumed by the `.keyboard-aware` rule).
  $effect(() => {
    const viewport = window.visualViewport
    if (!open || viewport == null) {
      return
    }

    const root = document.documentElement

    const update = () => {
      const overlap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      root.style.setProperty('--keyboard-inset', `${overlap}px`)
    }

    // Once a field is focused (and the keyboard has had time to settle), scroll it
    // into the now-shortened sheet so it never hides behind the keyboard.
    const reveal = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.bottom-sheet') == null) {
        return
      }
      if (!target.matches('input, textarea, select, [contenteditable="true"]')) {
        return
      }
      setTimeout(() => target.scrollIntoView({ block: 'center' }), 150)
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    document.addEventListener('focusin', reveal)

    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.removeEventListener('focusin', reveal)
      root.style.removeProperty('--keyboard-inset')
    }
  })
</script>

{@render trigger?.({})}

{#snippet content()}
  <BottomSheet.Sheet
    class="preset-filled-surface-50-950! keyboard-aware modal-sheet {backdrop ? 'modal-elevated' : ''} {nested
      ? 'modal-elevated-nested'
      : ''}"
  >
    <div
      class="preset-filled-surface-50-950 border-surface-100-900 flex shrink-0 items-center justify-between border-b-2 px-4 py-2"
    >
      {#if headerLeft}
        {@render headerLeft()}
      {/if}

      <div class="flex flex-col">
        {#if subtitle}
          <span class="text-sm opacity-60">{subtitle}</span>
        {/if}

        <span class="text-lg">{title}</span>
      </div>

      {#if headerRight}
        {@render headerRight()}
      {:else}
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

    <BottomSheet.Content class="w-full px-4! pt-4! pb-4!">
      {@render children?.()}
    </BottomSheet.Content>

    {#if footer}
      <!-- A plain flex item, outside the scroll area (see the style block), which is the only
           arrangement where content cannot pass under it. Pinning it over the scrollport, by
           `fixed` or by `sticky`, means the scroll area has to reserve its height by hand, and
           any number chosen for that is wrong for the next caller who puts something taller in
           the footer. The bottom padding clears the home indicator on a gesture-navigation
           phone. -->
      <div
        class="bg-surface-50-950 border-surface-100-900 z-100 flex shrink-0 items-center justify-end gap-2 border-t-2 px-4 pt-4"
        style:padding-bottom="calc(1rem + env(safe-area-inset-bottom))"
      >
        {@render footer()}
      </div>
    {/if}
  </BottomSheet.Sheet>
{/snippet}

<Portal>
  <BottomSheet settings={{ maxHeight: snapPoints[0], snapPoints }} bind:isSheetOpen={open}>
    {#if backdrop}
      <!-- Scrim behind the sheet; tap to dismiss. stopPropagation keeps the tap from
           reaching the map panel's document-click handler (which would collapse it). -->
      <BottomSheet.Overlay
        class={nested ? 'modal-overlay modal-overlay-nested' : 'modal-overlay'}
        onclick={(event) => {
          event.stopPropagation()
          open = false
        }}
      />
    {/if}
    {@render content()}
  </BottomSheet>
</Portal>

<style>
  /* A sheet can open above a modal dialog (e.g. the media viewer's Share sheet). That
     parent sets `pointer-events: none` on <body> to inert the background, which this
     portaled sheet would otherwise inherit, going dead to taps (every tap then falls
     through to the dialog behind, whose own outside-click detection dismisses the
     sheet). Re-assert it so the sheet is interactive wherever it is mounted. */
  :global(.bottom-sheet),
  :global(.bottom-sheet-overlay) {
    pointer-events: auto;
  }

  /* Lift the fixed sheet above the keyboard by the measured overlap (set in JS). */
  :global(.bottom-sheet.keyboard-aware) {
    bottom: var(--keyboard-inset, 0px) !important;
  }

  /* Header / scroll area / footer as a column, so only the middle scrolls and the header and
     footer keep their own space. svelte-bottom-sheet builds for exactly this (its `.scroll-clip`
     already carries `flex-grow: 1`) but only sets `display: flex` for the left, right and top
     positions, so a bottom sheet is left as a single scrolling block with its `.scroll-clip`
     clipped rather than scrollable. That is what puts a long list under a pinned footer.

     Keyed to `.modal-sheet` (this component's own marker) rather than to the library's
     `.position-bottom`: the map's sheet is a bottom sheet too, and it wants the library's
     single-scrolling-block layout. A global rule on the position class rewrites that one as
     well, and it cannot opt out of the `overflow-y` half by any class of its own. */
  :global(.bottom-sheet.modal-sheet) {
    display: flex;
    flex-direction: column;
    /* `!important` because the library's own `overflow-y: auto` is `.bottom-sheet.svelte-<hash>`,
       the same specificity as this, so without it the winner is whichever stylesheet the bundler
       emitted last. `.scroll-clip` below is the one scrollport this sheet has. */
    overflow-y: hidden !important;
  }

  :global(.bottom-sheet.modal-sheet .scroll-clip) {
    min-height: 0;
    overflow-y: auto;
  }

  /* Backdrop-only: sit the sheet + scrim above the map's persistent area panel (z-50). */
  :global(.bottom-sheet.modal-elevated) {
    z-index: 61 !important;
  }

  :global(.bottom-sheet-overlay.modal-overlay) {
    z-index: 60 !important;
    /* Blur what's behind the scrim so the sheet is the only thing in focus. */
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  /* A sheet opened on top of another sheet (e.g. add-route over the routes list) must clear
     the underlying sheet (z-61) so it fully covers it instead of letting it peek through. */
  :global(.bottom-sheet.modal-elevated-nested) {
    z-index: 71 !important;
  }

  :global(.bottom-sheet-overlay.modal-overlay-nested) {
    z-index: 70 !important;
  }
</style>
