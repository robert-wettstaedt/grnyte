<script lang="ts">
  // import { m } from '$lib/paraglide/messages'
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
        class="card bg-surface-100-900 border-surface-200-800 flex h-full w-full max-w-sm flex-col overflow-hidden border-2 lg:max-w-md"
      >
        <header class="flex shrink-0 items-start justify-between p-4 shadow">
          <div class="flex items-center gap-2">
            {#if sheetState.headerLeft}
              {@render sheetState.headerLeft()}
            {/if}

            <Dialog.Title class="flex flex-col">
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
            </Dialog.Title>
          </div>

          <!-- <Dialog.CloseTrigger class="btn-icon" aria-label={m.common_close()}>
            <Icon name="close" />
          </Dialog.CloseTrigger> -->
        </header>

        <Dialog.Description class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
          {@render children?.()}
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
