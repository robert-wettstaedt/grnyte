<script lang="ts">
  import type { DialogRootProps } from '@skeletonlabs/skeleton-svelte'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'

  interface Props extends DialogRootProps {
    content?: Snippet
    title?: string
    trigger?: Snippet
  }

  const { content, title, trigger, ...props }: Props = $props()
</script>

<Dialog {...props}>
  <Dialog.Trigger>
    {@render trigger?.()}
  </Dialog.Trigger>

  <Portal>
    <Dialog.Backdrop class="bg-surface-50-950/50 fixed inset-0 z-50 backdrop-blur-sm" />

    <Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Dialog.Content
        class="card bg-surface-100-900 max-h-[90vh] max-w-screen-sm space-y-4 overflow-y-auto p-4 shadow-xl"
      >
        <header class="flex items-center justify-between">
          <Dialog.Title class="text-lg font-bold">{title}</Dialog.Title>
          <Dialog.CloseTrigger class="btn-icon hover:preset-tonal">
            <i class="fa-solid fa-xmark"></i>
          </Dialog.CloseTrigger>
        </header>

        <Dialog.Description class="opacity-60">
          {@render content?.()}
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
