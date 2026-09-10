<script lang="ts">
  import { ACTION_CTA, ACTION_TOOL } from '$lib/components/ActionBar/ActionBar.svelte'
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
  <a
    aria-label={variant === 'tool' ? m.common_directions() : undefined}
    class={variant === 'cta' ? [ACTION_CTA, 'preset-filled-primary-500'] : ACTION_TOOL}
    href={directionsUrl}
    rel="noopener noreferrer"
    target="_blank"
  >
    <Icon name="navigation" size={variant === 'cta' ? 18 : 19} />
    {#if variant === 'cta'}
      <span class="text-sm font-bold">{m.common_directions()}</span>
    {/if}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
