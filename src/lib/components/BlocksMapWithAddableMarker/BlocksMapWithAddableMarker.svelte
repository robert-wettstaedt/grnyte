<script lang="ts">
  import BlocksMap, { type NestedBlock } from '$lib/components/BlocksMap'
  import type { Area } from '$lib/db/schema'
  import type { InferResultType } from '$lib/db/types'
  import Feature from 'ol/Feature.js'
  import Map from 'ol/Map.js'
  import type { Coordinate } from 'ol/coordinate'
  import Point from 'ol/geom/Point.js'
  import { Vector as VectorLayer } from 'ol/layer.js'
  import { toLonLat } from 'ol/proj'
  import { Vector as VectorSource } from 'ol/source.js'
  import { createEventDispatcher } from 'svelte'

  interface Props {
    blocks: NestedBlock[]
    selectedArea?: Area | null
    selectedBlock?: InferResultType<'blocks', { geolocation: true }> | null
  }

  let { blocks, selectedArea = null, selectedBlock = null }: Props = $props()

  const dispatch = createEventDispatcher<{ change: Coordinate }>()

  const onAction = ({ detail: map }: CustomEvent<Map>) => {
    let marker: Feature<Point> | null = null

    map.on('click', (event) => {
      if (marker == null) {
        marker = new Feature({
          geometry: new Point(event.coordinate),
        })

        const vectorSource = new VectorSource({
          features: [marker],
        })

        const vectorLayer = new VectorLayer({
          source: vectorSource as any,
        })

        map.addLayer(vectorLayer)
      } else {
        marker.getGeometry()?.setCoordinates(event.coordinate)
      }

      dispatch('change', toLonLat(event.coordinate))
    })
  }
</script>

<BlocksMap {blocks} {selectedArea} {selectedBlock} on:action={onAction} />
