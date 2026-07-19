<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Dialog, Popover, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Props } from './types'

  let {
    backdrop = false,
    children,
    contentClass,
    footer,
    headerLeft,
    headerRight,
    open = $bindable(),
    panel = false,
    panelClass,
    popoverProps,
    subtitle,
    title,
    trigger,
  }: Props = $props()
</script>

{#if panel}
  <!-- Opt-in fixed panel: a non-modal dialog positioned via panelClass/contentClass
       (e.g. under the search bar, or beside the routes sheet) instead of anchoring
       to the trigger. Close via the X, Escape, or re-tapping the trigger. -->
  {@render trigger?.({})}

  <!-- backdrop opts this panel into modal behaviour: a blurred scrim, tap-outside
       to close and a focus trap. Without it the panel stays non-modal (e.g. the
       search-bar panel, where the background must remain interactive). -->
  <Dialog {open} onOpenChange={(event) => (open = event.open)} modal={backdrop} closeOnInteractOutside={backdrop}>
    <Portal>
      {#if backdrop}
        <Dialog.Backdrop class="bg-surface-50-950/50 fixed inset-0 z-40 backdrop-blur-sm" />
      {/if}

      <Dialog.Positioner class={panelClass}>
        <Dialog.Content
          class={['card bg-surface-50-950 border-surface-100-900 flex flex-col overflow-hidden border-2', contentClass]}
        >
          <header class="flex shrink-0 items-center justify-between gap-2 px-4 py-2 shadow">
            {#if headerLeft}
              {@render headerLeft()}
            {/if}

            <Dialog.Title class="flex min-w-0 flex-col">
              {#if subtitle}
                <span class="text-surface-600-400 text-xs">{subtitle}</span>
              {/if}
              <span class="text-lg">{title}</span>
            </Dialog.Title>

            {#if headerRight}
              {@render headerRight()}
            {:else}
              <Dialog.CloseTrigger
                class="btn-icon preset-filled-surface-200-800 shrink-0"
                aria-label={m.common_close()}
              >
                <Icon name="close" />
              </Dialog.CloseTrigger>
            {/if}
          </header>

          <Dialog.Description class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-2 pb-4">
            {@render children?.()}
          </Dialog.Description>

          {#if footer}
            <div
              class="bg-surface-50-950 border-surface-100-900 flex shrink-0 items-center justify-end gap-2 border-t-2 p-4"
            >
              {@render footer()}
            </div>
          {/if}
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog>
{:else}
  <Popover {...popoverProps} {open} onOpenChange={(event) => (open = event.open)}>
    <Popover.Trigger element={trigger}></Popover.Trigger>

    <Portal>
      <Popover.Positioner>
        <!-- Zag mirrors the content's z-index onto the positioner, so this is what stacks the
             whole popover. z-60 clears the map's area dialog (z-50) instead of hiding behind it. -->
        <!-- Full border + drop shadow so the popover reads as a floating layer instead of
             blending into the page (both share the same surface background). -->
        <Popover.Content
          class={['card bg-surface-50-950 border-surface-200-800 z-60 border shadow-2xl', contentClass ?? 'w-96']}
        >
          <div class="space-y-4">
            <header class="flex flex-col px-4 py-2 shadow">
              {#if subtitle}
                <span class="text-sm opacity-60">{subtitle}</span>
              {/if}

              <span class="text-lg">{title}</span>
            </header>

            <Popover.Description class="px-4 pb-4">
              {@render children?.()}
            </Popover.Description>

            {#if footer}
              <div class="border-surface-100-900 flex items-center justify-end gap-2 border-t-2 px-4 py-3">
                {@render footer()}
              </div>
            {/if}
          </div>

          <Popover.Arrow class="[--arrow-background:var(--color-surface-50-950)] [--arrow-size:--spacing(2)]">
            <Popover.ArrowTip />
          </Popover.Arrow>
        </Popover.Content>
      </Popover.Positioner>
    </Portal>
  </Popover>
{/if}
