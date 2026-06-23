<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { Snippet } from 'svelte'

  interface Props {
    /** Sheet title — usually the entity name. */
    title: string
    /** Menu body; receives a `close` callback to dismiss the sheet after an action. */
    children: Snippet<[close: () => void]>
  }

  const { title, children }: Props = $props()

  let open = $state(false)
</script>

<Modal
  backdrop
  bind:open
  panel
  panelClass="fixed inset-0 left-[31.25rem] z-60 flex items-start py-12 lg:left-[35.25rem]"
  contentClass="max-h-[calc(100dvh-6rem)] w-80"
  subtitle={m.area_manage()}
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
