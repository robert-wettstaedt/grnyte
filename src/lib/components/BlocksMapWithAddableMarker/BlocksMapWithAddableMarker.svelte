<script lang="ts">
  import type { BlocksMapProps } from '$lib/components/BlocksMap'
  import BlocksMap from '$lib/components/BlocksMap/ZeroLoader.svelte'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import Feature from 'ol/Feature.js'
  import Map from 'ol/Map.js'
  import type MapBrowserEvent from 'ol/MapBrowserEvent'
  import type { Coordinate } from 'ol/coordinate'
  import Polyline from 'ol/format/Polyline'
  import { Geometry, LineString } from 'ol/geom'
  import Point from 'ol/geom/Point.js'
  import { Draw } from 'ol/interaction'
  import { Vector as VectorLayer } from 'ol/layer.js'
  import { toLonLat } from 'ol/proj'
  import { Vector as VectorSource } from 'ol/source.js'

  interface Mode {
    icon: string
    value: 'click' | 'draw'
  }

  interface Props extends Pick<BlocksMapProps, 'selectedArea' | 'selectedBlock'> {
    onChange?: (coordinate: Coordinate | string) => void
    modes?: Mode[]
  }

  let { onChange, selectedArea = null, selectedBlock = null, modes }: Props = $props()
  let mode = $state(modes?.[0].value)
  let map: Map | null = $state(null)
  let vectorSource = $state<VectorSource<Feature<Geometry>> | null>(null)
  let vectorLayer = $state<VectorLayer | null>(null)

  $effect(() => {
    if (map == null) {
      return
    }

    if (vectorSource == null) {
      vectorSource = new VectorSource({
        features: [],
      })

      vectorLayer = new VectorLayer({
        source: vectorSource,
      })

      map.addLayer(vectorLayer)
    }

    if (mode == null || mode === 'click') {
      let marker: Feature<Point> | null = null

      function handler(event: MapBrowserEvent<KeyboardEvent | WheelEvent | PointerEvent>) {
        if (marker == null) {
          marker = new Feature({
            geometry: new Point(event.coordinate),
          })

          vectorSource?.addFeature(marker)
        } else {
          marker.getGeometry()?.setCoordinates(event.coordinate)
        }

        onChange?.(toLonLat(event.coordinate))
      }

      map.on('click', handler)

      return () => {
        marker?.dispose()
        marker = null
        map?.un('click', handler)
      }
    } else if (mode === 'draw') {
      const draw = new Draw({
        geometryName: 'walking-path',
        source: vectorSource,
        type: 'LineString',
      })

      map.addInteraction(draw)

      function handler() {
        const features = draw.getOverlay().getSource()?.getFeatures() as Feature<LineString>[] | undefined
        const geometry = features?.find((feature) => feature.getGeometryName() === 'walking-path')?.getGeometry()

        if (geometry == null) {
          return
        }

        const mapCoords = geometry.getCoordinates()
        const lonLatCoords = mapCoords.map((coord) => toLonLat(coord))

        const encodedPolyline = new Polyline({ geometryLayout: 'XY' }).writeGeometry(
          new LineString(lonLatCoords.toReversed()),
        )

        onChange?.(encodedPolyline)
      }

      map.on('click', handler)

      return () => {
        map?.un('click', handler)
        map?.removeInteraction(draw)
        draw.dispose()
      }
    }
  })

  const onAction = (_map: Map) => {
    map = _map
  }
</script>

<div class="relative h-full">
  <BlocksMap {selectedArea} {selectedBlock} {onAction} />

  {#if modes != null}
    <div class="absolute top-2 left-2">
      <SegmentedControl
        class="bg-surface-950"
        name="mode"
        onValueChange={(event) => (mode = modes.find((mode) => mode.value === event.value)?.value)}
        value={mode}
      >
        <SegmentedControl.Control>
          {#each modes as mode}
            <SegmentedControl.Indicator />
            <SegmentedControl.Item value={mode.value}>
              <SegmentedControl.ItemText>
                <i class={mode.icon}></i>
              </SegmentedControl.ItemText>
              <SegmentedControl.ItemHiddenInput />
            </SegmentedControl.Item>
          {/each}
        </SegmentedControl.Control>
      </SegmentedControl>
    </div>
  {/if}
</div>
