<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Portal } from '@skeletonlabs/skeleton-svelte'
  import { BottomSheet } from 'svelte-bottom-sheet'
  import type { Props } from './types'

  let {
    children,
    headerLeft,
    headerRight,
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
  <BottomSheet.Sheet class="preset-filled-surface-50-950! keyboard-aware">
    <div
      class="preset-filled-surface-50-950 border-surface-100-900 sticky top-0 z-100 flex items-center justify-between border-b-2 px-4 py-2"
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
          class="btn-icon"
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

    <BottomSheet.Content class="w-full px-4! pt-4!">
      {@render children?.()}
    </BottomSheet.Content>
  </BottomSheet.Sheet>
{/snippet}

<Portal>
  <BottomSheet settings={{ maxHeight: snapPoints[0], snapPoints }} bind:isSheetOpen={open}>
    {@render content()}
  </BottomSheet>
</Portal>

<style>
  /* Lift the fixed sheet above the keyboard by the measured overlap (set in JS). */
  :global(.bottom-sheet.keyboard-aware) {
    bottom: var(--keyboard-inset, 0px) !important;
  }
</style>
