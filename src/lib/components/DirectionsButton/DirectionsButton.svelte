<script lang="ts">
  import { ACTION_CTA, ACTION_TOOL, ACTION_TOOL_LABEL } from '$lib/components/ActionBar/ActionBar.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { mapsUrl, type Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'

  /** Distance lives on the location meta line: it is a fact about the place, not about this button. */
  interface Props {
    /** Where to drive: a parking pin, or a sector's parking/block centroid. */
    destination: Coords | undefined
    /** `cta` on a parking pin, which exists for nothing else; a tool square everywhere else. */
    variant?: 'cta' | 'tool'
  }

  const { destination, variant = 'tool' }: Props = $props()

  const directionsUrl = $derived(destination == null ? undefined : mapsUrl(destination))
</script>

{#if directionsUrl != null}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- external maps deep link, not an app route -->
  {#if variant === 'cta'}
    <a class={[ACTION_CTA, 'preset-filled-primary-500']} href={directionsUrl} rel="noopener noreferrer" target="_blank">
      <Icon name="navigation" size={18} />
      <span class="text-sm font-bold">{m.common_directions()}</span>
    </a>
  {:else}
    <!-- Short label, and the name matches it so voice control can target the visible word.
         "Directions" squeezed the bar's CTA into an ellipsis. -->
    <a
      aria-label={m.common_directionsShort()}
      class={ACTION_TOOL}
      href={directionsUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <Icon name="navigation" size={19} />
      <span class={ACTION_TOOL_LABEL}>{m.common_directionsShort()}</span>
    </a>
  {/if}
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
