<!-- One stored layer in the list: an image of its whole coverage (one request), or a placeholder
     before the layer has one. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Row from '$lib/components/EntityRow/Row.svelte'
  import Thumb from '$lib/components/EntityRow/Thumb.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { coverageImageUrl } from '$lib/entities/region/coverage'
  import { mapLayerSegment, type MapLayer } from '$lib/entities/region/settings'
  import { m } from '$lib/paraglide/messages'

  interface Props {
    layer: MapLayer
    regionId: number
  }

  const { layer, regionId }: Props = $props()

  // Far larger than the 52 px slot: some services (Bayern) draw nothing for a whole state below
  // about 512 px, and a blank image cannot be detected, since it loads without CORS.
  const image = $derived(coverageImageUrl(layer, 512, 512))
  const zoom = $derived(
    layer.minZoom == null ? m.region_mapLayerAllZooms() : m.region_mapLayerFromZoom({ zoom: layer.minZoom }),
  )
</script>

<Row
  href={resolve('/(app)/regions/[regionId]/map-layers/[layer]', {
    layer: mapLayerSegment(layer),
    regionId: String(regionId),
  })}
  title={layer.name}
>
  {#if image == null}
    <Thumb fallback="map" />
  {:else}
    <span class="bg-surface-200-800 grid size-[52px] flex-none place-items-center overflow-hidden rounded-xl">
      <img alt="" class="size-full object-contain" loading="lazy" src={image} />
    </span>
  {/if}

  {#snippet description()}
    <span class="text-surface-600-400 mt-0.5 flex items-center gap-2 text-[12.5px]">
      <span class="badge preset-tonal-surface text-xs">
        {layer.type === 'template' ? m.region_mapLayerTypeTemplate() : m.region_mapLayerTypeWms()}
      </span>
      <span>{zoom}</span>
    </span>
  {/snippet}

  {#snippet rightContent()}
    <Icon class="text-surface-500 flex-none" name="chevron-right" size={18} />
  {/snippet}
</Row>
