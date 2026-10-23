<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { DialogRootProps } from '@skeletonlabs/skeleton-svelte'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  type Action = () => Promise<unknown> | void

  interface Props extends DialogRootProps {
    content?: Snippet
    /** The main action deletes, removes or leaves, so it renders in the error colour. */
    destructive?: boolean
    onsave?: Action
    saveText?: string
    /** A second action beside the main one, closing the dialog like it. Renders only with `onsave`. */
    secondary?: { onclick: Action; text: string }
    title?: string
    /** asChild: spread the given props onto your own focusable element so it becomes the trigger. */
    trigger?: Snippet<[HTMLButtonAttributes]>
  }

  const {
    content,
    destructive = false,
    onsave,
    saveText = m.common_save(),
    secondary,
    title,
    trigger,
    ...props
  }: Props = $props()

  let running = $state<'main' | 'secondary'>()
  const run = async (which: 'main' | 'secondary', action: Action) => {
    if (running != null) return
    running = which
    try {
      await action()
      props.onOpenChange?.({ open: false })
    } finally {
      running = undefined
    }
  }
</script>

{#snippet actionButton(which: 'main' | 'secondary', action: Action, text: string, preset: string)}
  <button
    disabled={running != null}
    type="button"
    class="btn {preset} w-full md:w-auto"
    onclick={() => run(which, action)}
  >
    {#if running === which}
      <LoadingIndicator />
    {/if}

    {text}
  </button>
{/snippet}

<Dialog {...props}>
  {#if trigger != null}
    <Dialog.Trigger element={trigger} />
  {/if}

  <Portal>
    <Dialog.Backdrop class="bg-surface-50-950/50 fixed inset-0 z-50 backdrop-blur-sm" />

    <Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Dialog.Content
        class="card bg-surface-100-900 max-h-[90vh] w-full space-y-4 overflow-y-auto p-4 shadow-xl md:w-md"
      >
        <header class="flex items-center justify-between">
          <Dialog.Title class="text-lg font-bold">{title}</Dialog.Title>

          <Dialog.CloseTrigger
            class="btn-icon preset-filled-surface-200-800 hover:preset-tonal"
            aria-label={m.common_close()}
          >
            <Icon name="close" />
          </Dialog.CloseTrigger>
        </header>

        <Dialog.Description class="opacity-60">
          {@render content?.()}
        </Dialog.Description>

        {#if onsave != null}
          <!-- DOM order is the desktop row and the Tab order; mobile stacks it reversed, main on top. -->
          <footer class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Dialog.CloseTrigger class="btn preset-tonal mt-2 w-full md:mt-0 md:w-auto">
              {m.common_cancel()}
            </Dialog.CloseTrigger>

            {#if secondary != null}
              {@render actionButton('secondary', secondary.onclick, secondary.text, 'preset-tonal')}
            {/if}

            {@render actionButton('main', onsave, saveText, destructive ? 'preset-filled-error-500' : 'preset-filled')}
          </footer>
        {/if}
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
