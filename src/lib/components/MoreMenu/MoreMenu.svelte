<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'

  interface Props {
    /** Menu body; receives a `close` callback to dismiss the sheet after an action. */
    children: Snippet<[close: () => void]>
    /** Desktop: the map-sheet side panel (default), or a trigger-anchored popover for standalone pages. */
    panel?: boolean
    /** Sheet title, usually the entity name. */
    title: string
  }

  const { children, panel = true, title }: Props = $props()

  let open = $state(false)
</script>

<!-- Only the panel needs a height cap of its own: it is positioned by hand, so nothing measures
     it. The popover leaves the cap to Modal, whose default is what Zag measured between the
     trigger and the viewport edge, and so is right on whichever side the menu flipped to. -->
<Modal
  backdrop
  bind:open
  {panel}
  panelClass={panel ? 'fixed inset-0 left-[31.25rem] z-60 flex items-start py-2 lg:left-[35.25rem]' : undefined}
  contentClass={panel ? 'max-h-[calc(100dvh-6rem)] w-80' : 'w-80'}
  subtitle={m.areas_manage()}
  {title}
>
  {#snippet trigger(props)}
    <button
      {...props}
      type="button"
      class={[props.class, 'btn preset-tonal btn-lg h-12 w-12 px-0']}
      aria-label={m.common_more()}
      onclick={() => (open = !open)}
    >
      <Icon name="more" />
    </button>
  {/snippet}

  <div class="pb-2">
    {@render children(() => (open = false))}
  </div>
</Modal>
