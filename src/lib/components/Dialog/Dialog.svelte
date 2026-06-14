<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { DialogRootProps } from '@skeletonlabs/skeleton-svelte'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'

  interface Props extends DialogRootProps {
    content?: Snippet
    onsave?: () => void | Promise<unknown>
    pending?: number
    saveText?: string
    title?: string
    trigger?: Snippet
  }

  const { content, onsave, pending = 0, saveText = m.common_save(), title, trigger, ...props }: Props = $props()
</script>

<Dialog {...props}>
  {#if trigger != null}
    <Dialog.Trigger>
      {@render trigger()}
    </Dialog.Trigger>
  {/if}

  <Portal>
    <Dialog.Backdrop class="bg-surface-50-950/50 fixed inset-0 z-50 backdrop-blur-sm" />

    <Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Dialog.Content
        class="card bg-surface-100-900 max-h-[90vh] max-w-screen-sm space-y-4 overflow-y-auto p-4 shadow-xl"
      >
        <header class="flex items-center justify-between">
          <Dialog.Title class="text-lg font-bold">{title}</Dialog.Title>
          <Dialog.CloseTrigger class="btn-icon hover:preset-tonal" aria-label={m.common_close()}>
            <Icon name="close" />
          </Dialog.CloseTrigger>
        </header>

        <Dialog.Description class="opacity-60">
          {@render content?.()}
        </Dialog.Description>

        {#if onsave != null}
          <footer class="flex justify-end gap-2">
            <Dialog.CloseTrigger class="btn preset-tonal">
              {m.common_cancel()}
            </Dialog.CloseTrigger>

            <button
              disabled={pending > 0}
              type="button"
              class="btn preset-filled"
              onclick={async () => {
                await onsave?.()
                props.onOpenChange?.({ open: false })
              }}
            >
              {#if pending > 0}
                <LoadingIndicator />
              {/if}

              {saveText}
            </button>
          </footer>
        {/if}
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
