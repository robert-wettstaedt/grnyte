<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { userLocation } from '$lib/map/geolocation.svelte'
  import { formatDistance, haversineMetres, mapsUrl, type Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** Where to drive — a parking pin, or a crag's parking/block centroid. */
    destination: Coords | undefined
  }

  const { destination }: Props = $props()

  // Shared live location, updated as the user walks toward the destination.
  const location = userLocation()

  const directionsUrl = $derived(destination == null ? undefined : mapsUrl(destination))
  const distance = $derived(
    location.current == null || destination == null ? undefined : formatDistance(location.current, destination),
  )
  // ponytail: 50 m "you're here" radius; tune for GPS accuracy / crag size.
  const isHere = $derived(
    location.current != null && destination != null && haversineMetres(location.current, destination) < 50,
  )
</script>

{#if directionsUrl != null}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- external maps deep link, not an app route -->
  <a
    class="btn preset-filled-primary-500 btn-lg flex-1 text-base"
    href={directionsUrl}
    rel="noopener noreferrer"
    target="_blank"
  >
    <Icon name={isHere ? 'map-pin' : 'navigation'} size={18} />
    {#if isHere}
      <span class="text-sm leading-none">{m.area_youAreHere()}</span>
    {:else}
      <!-- Tight leading keeps the stacked label + distance within the button's text-base line
           height, so the distance fills that line rather than growing the row (no shift), while
           the label still centres on its own when there's no distance yet. -->
      <span class="flex flex-col items-start leading-none">
        <span class="text-sm leading-none font-bold">{m.common_directions()}</span>
        {#if distance != null}
          <span class="text-[10px] leading-none font-normal opacity-80">{m.area_distanceAway({ distance })}</span>
        {/if}
      </span>
    {/if}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
