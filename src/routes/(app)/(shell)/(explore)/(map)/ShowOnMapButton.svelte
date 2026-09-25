<script lang="ts">
  import { ACTION_TOOL, ACTION_TOOL_LABEL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { m } from '$lib/paraglide/messages'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'
  import { sheetState } from '../Modal/sheetState.svelte'

  /** Hands the camera back to the open entity after a location fix or a pan took it. Lives here
   *  because the request rides on the explore sheet's state. Gates itself on what the map can
   *  frame, so no caller can disagree with the map. */

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)
</script>

{#if sheetState.canShowOnMap}
  <!-- `slide` on the inline axis, not `scale`: it appears mid-read when the row lands, and only
       animating the WIDTH stops it shoving its neighbours. Short caption, fuller accessible name. -->
  <button
    type="button"
    aria-label={m.map_showOnMap()}
    class={ACTION_TOOL}
    onclick={() => (sheetState.showOnMapRequest += 1)}
    transition:slide={{ axis: 'x', duration }}
  >
    <Icon name="map-pin" size={19} />
    <span class={ACTION_TOOL_LABEL}>{m.map_show()}</span>
  </button>
{/if}
