<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Dialog, Portal, Tooltip } from '@skeletonlabs/skeleton-svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { sheetState } from './sheetState.svelte'
  import type { ModalProps } from './types'

  let { children, onclose, open = $bindable() }: ModalProps = $props()

  // Keep compatibility with callers that may still set this value.
  $effect(() => {
    if (sheetState.requestSnap != null) {
      sheetState.requestSnap = null
    }
  })
</script>

<Dialog
  {open}
  onOpenChange={(event) => {
    open = event.open
    if (!open) {
      onclose?.()
    }
  }}
  modal={false}
  preventScroll={false}
>
  <Portal>
    <Dialog.Positioner class="fixed inset-0 left-27 z-50 flex items-start py-12">
      <div class="group relative flex h-full w-full max-w-sm lg:max-w-md">
        {#if sheetState.nav}
          {@const nav = sheetState.nav}
          <!-- Thin tabs sit mostly behind the card (z below it), peeking a sliver at rest;
               on card hover (or keyboard focus) they slide fully out from under the left/right
               edges. Narrow enough to clear the nav rail on the left without shifting the card.
               Tooltips surface the j/l shortcuts. -->
          <!-- eslint-disable svelte/no-navigation-without-resolve -- nav hrefs are pre-resolved in the page (toSheetNav). -->
          <Tooltip openDelay={300}>
            <Tooltip.Trigger>
              {#snippet element(attributes)}
                <a
                  {...attributes as unknown as HTMLAttributes<HTMLAnchorElement>}
                  class="preset-filled-surface-200-800 pointer-events-auto absolute top-1/2 left-0 z-0 flex h-14 w-6 -translate-x-2.5 -translate-y-1/2 items-center justify-center rounded-l-lg transition-transform duration-200 ease-out group-hover:-translate-x-full group-hover:shadow-lg focus-visible:-translate-x-full focus-visible:shadow-lg"
                  href={nav.prev.href}
                  aria-label={nav.prev.label}
                >
                  <Icon name="chevron-left" size={20} />
                </a>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Positioner>
              <Tooltip.Content
                class="card preset-filled-surface-950-50 z-50 flex items-center gap-1.5 px-2 py-1 text-xs shadow-lg"
              >
                {nav.prev.label}
                <kbd class="kbd text-surface-950-50!">J</kbd>
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Tooltip>

          <Tooltip openDelay={300}>
            <Tooltip.Trigger>
              {#snippet element(attributes)}
                <a
                  {...attributes as unknown as HTMLAttributes<HTMLAnchorElement>}
                  class="preset-filled-surface-200-800 pointer-events-auto absolute top-1/2 right-0 z-0 flex h-14 w-6 translate-x-2.5 -translate-y-1/2 items-center justify-center rounded-r-lg transition-transform duration-200 ease-out group-hover:translate-x-full group-hover:shadow-lg focus-visible:translate-x-full focus-visible:shadow-lg"
                  href={nav.next.href}
                  aria-label={nav.next.label}
                >
                  <Icon name="chevron-right" size={20} />
                </a>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Positioner>
              <Tooltip.Content
                class="card preset-filled-surface-950-50 z-50 flex items-center gap-1.5 px-2 py-1 text-xs shadow-lg"
              >
                {nav.next.label}
                <kbd class="kbd text-surface-950-50!">L</kbd>
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Tooltip>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}

        <Dialog.Content
          class="card bg-surface-50-950 border-surface-100-900 relative z-10 flex h-full w-full flex-col overflow-hidden border-2"
        >
          <header class="flex shrink-0 flex-col gap-2 px-4 py-2 shadow">
            <div class="flex items-start justify-between gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                {#if sheetState.headerLeft}
                  {@render sheetState.headerLeft()}
                {/if}

                <Dialog.Title class="flex min-w-0 flex-col">
                  {#if typeof sheetState.subtitle === 'string'}
                    <span class="text-surface-600-400 shrink-0 text-xs">{sheetState.subtitle}</span>
                  {:else if sheetState.subtitle != null}
                    {@render sheetState.subtitle()}
                  {/if}

                  {#if typeof sheetState.title === 'string'}
                    <span class="text-lg">{sheetState.title}</span>
                  {:else if sheetState.title != null}
                    {@render sheetState.title()}
                  {/if}
                </Dialog.Title>
              </div>

              <Dialog.CloseTrigger
                class="btn-icon preset-filled-surface-200-800 shrink-0"
                aria-label={m.common_close()}
              >
                <Icon name="close" />
              </Dialog.CloseTrigger>
            </div>

            {#if sheetState.toolbar}
              {@render sheetState.toolbar()}
            {/if}
          </header>

          <Dialog.Description class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
            {@render children?.()}
          </Dialog.Description>
        </Dialog.Content>
      </div>
    </Dialog.Positioner>
  </Portal>
</Dialog>
