<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
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
      <Dialog.Content
        class="card bg-surface-50-950 border-surface-100-900 flex h-full w-full max-w-sm flex-col overflow-hidden border-2 lg:max-w-md"
      >
        <header class="flex shrink-0 items-start justify-between gap-2 p-4 shadow">
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

          <Dialog.CloseTrigger class="btn-icon preset-filled-surface-200-800 shrink-0" aria-label={m.common_close()}>
            <Icon name="close" />
          </Dialog.CloseTrigger>
        </header>

        <Dialog.Description class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
          {@render children?.()}
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
