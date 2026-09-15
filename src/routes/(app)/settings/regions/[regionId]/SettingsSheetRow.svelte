<script lang="ts">
  import Modal from '$lib/components/Modal/Modal.svelte'
  import type { Snippet } from 'svelte'

  // The shape every row on these screens shares: the whole row is the trigger, and its sheet
  // (popover on desktop) holds the actions.
  interface Props {
    /** The sheet body, usually menu rows. */
    children: Snippet
    /** Row classes on top of the shared layout, e.g. the gap. */
    class?: string
    /** What the row itself shows, inside the trigger button. */
    label: Snippet
    /** Runs on every press of the row, before the sheet toggles. */
    ontrigger?: () => void
    open: boolean
    subtitle?: string
    title: string
  }

  let { children, class: className, label, ontrigger, open = $bindable(), subtitle, title }: Props = $props()
</script>

<!-- panel={false}: anchored popover on desktop, bottom sheet on mobile, which leaves the trigger
     unwired, so the click handler is ours. The height cap lets a long menu scroll. -->
<Modal
  backdrop
  bind:open
  panel={false}
  contentClass="max-h-[var(--available-height)] w-80 overflow-y-auto"
  popoverProps={{ positioning: { placement: 'bottom-end' } }}
  {subtitle}
  {title}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'hover:bg-surface-100-900 flex w-full items-center p-4 text-left', className]}
      onclick={() => {
        ontrigger?.()
        open = !open
      }}
    >
      {@render label()}
    </button>
  {/snippet}

  {@render children()}
</Modal>
