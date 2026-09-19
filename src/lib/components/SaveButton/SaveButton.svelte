<script lang="ts">
  import { ACTION_TOOL, ACTION_TOOL_LABEL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import KbdTooltip from '$lib/components/KbdTooltip/KbdTooltip.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'

  /** Presentational: state comes from `createSaveState`, so the action rows render without Zero. */
  interface Props {
    /** Savers including the signed-in user. Hidden at 0; shown, it widens the tool past the others. */
    count?: number
    ontoggle: () => void
    pending?: boolean
    saved?: boolean
  }

  const { count = 0, ontoggle, pending = false, saved = false }: Props = $props()

  // The tooltip says what a press does, so it flips with state.
  const action = $derived(
    count > 0
      ? saved
        ? m.favorite_removeWithCount({ count })
        : m.favorite_addWithCount({ count })
      : saved
        ? m.favorite_remove()
        : m.favorite_add(),
  )

  // The accessible name stays put: `aria-pressed` carries the state, and flipping both announces it twice.
  const name = $derived(count > 0 ? m.favorite_labelWithCount({ count }) : m.favorite_label())
</script>

<KbdTooltip label={action}>
  {#snippet trigger(attributes)}
    <button
      {...attributes}
      aria-label={name}
      aria-pressed={saved}
      class={[ACTION_TOOL, saved && 'preset-tonal-primary']}
      disabled={pending || !isOnline()}
      onclick={ontoggle}
      type="button"
    >
      <span class="flex items-center gap-1">
        {#if pending}
          <LoadingIndicator size="19px" />
        {:else}
          <Icon name="bookmark" fill={saved ? 'currentColor' : 'none'} size={19} />
        {/if}

        {#if count > 0}
          <span aria-hidden="true" class="text-[11px] leading-none font-bold tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        {/if}
      </span>

      <span class={ACTION_TOOL_LABEL}>{m.favorite_label()}</span>
    </button>
  {/snippet}
</KbdTooltip>
