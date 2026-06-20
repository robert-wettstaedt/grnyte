<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import { mapsUrl } from '$lib/maps'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    area: AreaDetail
  }

  const { area }: Props = $props()

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
</script>

{#if directionsUrl != null}
  <!-- eslint-disable svelte/no-navigation-without-resolve -- external maps deep link, not an app route -->
  <a
    class="btn preset-filled-primary-500 btn-lg flex-1 text-base"
    href={directionsUrl}
    rel="noopener noreferrer"
    target="_blank"
  >
    <Icon name="navigation" size={18} />
    {m.common_directions()}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
