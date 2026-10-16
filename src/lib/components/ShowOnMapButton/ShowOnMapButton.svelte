<script lang="ts">
  import { ACTION_TOOL, ACTION_TOOL_LABEL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { motion } from '$lib/state/motion.svelte'
  import { slide } from 'svelte/transition'

  /** Show on map: a link to an entity's map screen, or a press that re-frames the one already open. */
  interface Props {
    /** Where the entity's map screen is, already resolved; without it this is a button. */
    href?: string
    onclick?: () => void
    /** Whether there is anything to show, which the caller knows and the button does not. */
    shown: boolean
  }

  const { href, onclick, shown }: Props = $props()

  const duration = $derived(motion(150))
</script>

{#snippet face()}
  <Icon name="map-pin" size={19} />
  <span class={ACTION_TOOL_LABEL}>{m.map_show()}</span>
{/snippet}

<!-- `slide` on the inline axis, not `scale`: it appears mid-read when the row lands, and only
     animating the WIDTH stops it shoving its neighbours. Short caption, fuller accessible name. -->
{#if shown && href != null}
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolved href -->
  <a aria-label={m.map_showOnMap()} class={ACTION_TOOL} {href} transition:slide={{ axis: 'x', duration }}>
    {@render face()}
  </a>
{:else if shown}
  <button
    type="button"
    aria-label={m.map_showOnMap()}
    class={ACTION_TOOL}
    {onclick}
    transition:slide={{ axis: 'x', duration }}
  >
    {@render face()}
  </button>
{/if}
