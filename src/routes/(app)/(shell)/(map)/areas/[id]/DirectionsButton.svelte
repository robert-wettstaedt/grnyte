<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { formatDistance, haversineMetres, mapsUrl, type Coords } from '$lib/map/map'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()

  // Reuses the already-granted permission and live-updates the distance as the user
  // walks toward the crag. High accuracy so the metres reading is meaningful; the
  // watch is cleared on unmount, so the battery cost is bounded to this view.
  let position = $state<Coords>()
  onMount(() => {
    const id = navigator.geolocation?.watchPosition(
      (pos) => (position = { lat: pos.coords.latitude, long: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    )
    return () => {
      if (id != null) navigator.geolocation.clearWatch(id)
    }
  })

  // Head for the parking lot — that's the address you actually drive to. With no
  // parking pin, aim for the mean of the blocks anywhere beneath this area (a
  // name search would just send people to the wrong place).
  const parking = $derived(area.parkingLocations.at(0))
  const blocks = blockList(() => ({ areaId: area.id }))
  const blockCenter = $derived.by(() => {
    const coords = blocks.data.map((block) => block.geolocation).filter((geo) => geo != null)
    if (coords.length === 0) return undefined
    const lat = coords.reduce((sum, geo) => sum + geo.lat, 0) / coords.length
    const long = coords.reduce((sum, geo) => sum + geo.long, 0) / coords.length
    return { lat, long }
  })
  const destination = $derived(parking ?? blockCenter)
  const directionsUrl = $derived(destination == null ? undefined : mapsUrl(destination))
  const distance = $derived(position == null || destination == null ? undefined : formatDistance(position, destination))

  // "You're here" once you're standing among the blocks. Distance to the nearest block (not the
  // centroid) is the right signal — on a spread-out crag the centre can be far from where you are.
  // ponytail: 50 m radius; tune for GPS accuracy / crag size.
  const HERE_RADIUS_M = 50
  const nearestBlockMetres = $derived.by(() => {
    const pos = position
    if (pos == null) return undefined
    const distances = blocks.data
      .map((block) => block.geolocation)
      .filter((geo) => geo != null)
      .map((geo) => haversineMetres(pos, geo))
    return distances.length === 0 ? undefined : Math.min(...distances)
  })
  const isHere = $derived(nearestBlockMetres != null && nearestBlockMetres < HERE_RADIUS_M)
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
        <span class="text-sm leading-none">{m.common_directions()}</span>
        {#if distance != null}
          <span class="text-[10px] leading-none font-normal opacity-80">{m.area_distanceAway({ distance })}</span>
        {/if}
      </span>
    {/if}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
