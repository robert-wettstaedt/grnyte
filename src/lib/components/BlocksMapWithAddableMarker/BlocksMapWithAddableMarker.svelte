<script lang="ts">
  import BlocksMap from '$lib/components/BlocksMap'
  import type { Area } from '$lib/db/schema'
  import type { InferResultType } from '$lib/db/types'
  import Feature from 'ol/Feature.js'
  import Map from 'ol/Map.js'
  import type { Coordinate } from 'ol/coordinate'
  import Point from 'ol/geom/Point.js'
  import { Vector as VectorLayer } from 'ol/layer.js'
  import { toLonLat } from 'ol/proj'
  import { Vector as VectorSource } from 'ol/source.js'

  interface Props {
    onChange?: (coordinate: Coordinate) => void
    selectedArea?: Area | null
    selectedBlock?: InferResultType<'blocks', { geolocation: true }> | null
  }

  let { onChange, selectedArea = null, selectedBlock = null }: Props = $props()

  const onAction = (map: Map) => {
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

      onChange?.(toLonLat(event.coordinate))
    })
  }
</script>

<BlocksMap {selectedArea} {selectedBlock} {onAction} />
