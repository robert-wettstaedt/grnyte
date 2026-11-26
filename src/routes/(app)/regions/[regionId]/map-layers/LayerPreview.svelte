<!-- One region layer over the base map, through the same `createRegionLayers` the map uses, with its
     coverage outlined. The caller debounces `layer`; each new value rebuilds the overlay. -->
<script lang="ts">
  import type { MapLayer } from '$lib/entities/region/settings'
  import { parseCredit } from '$lib/map/attribution'
  import { createBaseMap, type BaseMap } from '$lib/map/base.svelte'
  import { contentExtent, type LatLng } from '$lib/map/camera.svelte'
  import { createRegionLayers } from '$lib/map/layers.svelte'
  import { m } from '$lib/paraglide/messages'
  import Feature from 'ol/Feature.js'
  import { fromExtent } from 'ol/geom/Polygon'
  import VectorLayer from 'ol/layer/Vector.js'
  import { transformExtent } from 'ol/proj.js'
  import VectorSource from 'ol/source/Vector.js'
  import { Stroke, Style } from 'ol/style.js'

  interface Props {
    blocks: LatLng[]
    layer: MapLayer | undefined
  }

  const { blocks, layer }: Props = $props()

  let base = $state<BaseMap>()

  const attach = (node: HTMLElement) => {
    const created = createBaseMap(node)
    base = created
    return () => {
      base = undefined
      created.destroy()
    }
  }

  const coverage = $derived(layer?.bounds == null ? null : transformExtent(layer.bounds, 'EPSG:4326', 'EPSG:3857'))
  const frame = $derived(coverage ?? contentExtent(blocks))

  // Credits are admin-written HTML: parsed into text and links, never `{@html}`.
  // Deduplicated: the same credit on two lines would repeat an each key, which throws.
  const credits = $derived(
    [...new Set(layer?.attributions ?? [])].map((credit) => ({ credit, parts: parseCredit(credit) })),
  )

  // fallow-ignore-next-line complexity -- overlay rebuild, verified by driving (13.3)
  $effect(() => {
    const map = base?.map
    if (map == null) return

    const added = [
      ...(layer == null ? [] : createRegionLayers([layer])),
      ...(coverage == null
        ? []
        : [
            new VectorLayer({
              source: new VectorSource({ features: [new Feature(fromExtent(coverage))] }),
              style: new Style({ stroke: new Stroke({ color: '#a855f7', lineDash: [8, 5], width: 2 }) }),
            }),
          ]),
    ]
    added.forEach((overlay) => map.addLayer(overlay))
    return () => added.forEach((overlay) => map.removeLayer(overlay))
  })

  // Framed once per target, so editing the opacity does not throw away the admin's own pan.
  let framed = ''
  // fallow-ignore-next-line complexity -- framing, verified by driving (13.3)
  $effect(() => {
    if (base == null || !base.hasSize || frame == null) return
    const key = JSON.stringify(frame)
    if (key === framed) return
    framed = key
    base.map.getView().fit(frame, { maxZoom: 15, padding: [24, 24, 24, 24] })
  })
</script>

<figure class="flex flex-col gap-2">
  <div
    {@attach attach}
    class="bg-surface-200-800 relative aspect-[4/3] w-full overflow-hidden rounded-xl md:aspect-square"
  ></div>
  <figcaption class="text-surface-600-400 flex flex-col gap-1 text-xs">
    <span>{m.region_mapLayerPreview()}</span>
    <span>
      &copy;
      <a
        class="text-primary-500 hover:underline"
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        OpenStreetMap
      </a>
      {#each credits as { credit, parts } (credit)}
        <span>
          ·
          {#each parts as part, index (index)}
            {#if part.href == null}
              {part.text}
            {:else}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external credit URL, scheme-checked by parseCredit -->
              <a class="text-primary-500 hover:underline" href={part.href} rel="noreferrer" target="_blank">
                {part.text}
              </a>
            {/if}
          {/each}
        </span>
      {/each}
    </span>
  </figcaption>
</figure>
