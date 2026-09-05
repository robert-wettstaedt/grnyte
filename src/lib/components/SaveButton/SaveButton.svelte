<script lang="ts">
  import { ACTION_TOOL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { m } from '$lib/paraglide/messages'
  import { isOnline } from '$lib/state/online.svelte'

  /** Presentational: state comes from `createSaveState`, so the action rows render without Zero. */
  interface Props {
    /** Savers including the signed-in user. Hidden at 0, and never widens the square. */
    count?: number
    ontoggle: () => void
    pending?: boolean
    saved?: boolean
  }

  const { count = 0, ontoggle, pending = false, saved = false }: Props = $props()

  const label = $derived(
    count > 0
      ? saved
        ? m.common_savedWithCount({ count })
        : m.common_saveWithCount({ count })
      : saved
        ? m.common_saved()
        : m.common_save(),
  )
</script>

<button
  aria-label={label}
  aria-pressed={saved}
  class={[ACTION_TOOL, 'gap-1', saved && 'preset-tonal-primary']}
  disabled={pending || !isOnline()}
  onclick={ontoggle}
  type="button"
>
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
</button>
