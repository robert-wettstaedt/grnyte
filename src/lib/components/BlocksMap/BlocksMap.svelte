<script lang="ts" module>
  export interface FeatureData {
    avatar?: { src?: string; icon?: string }
    className?: string
    geolocation?: Geolocation
    name: string
    pathname?: string
    priority: number
    subtitle?: string
  }

  export interface BlocksMapProps {
    collapsibleAttribution?: boolean
    blocks: NestedBlock[]
    selectedArea?: { id: number | undefined | null } | null
    selectedBlock?: { id: number | undefined | null } | null
    height?: number | string | null
    zoom?: number | null
    showRegionLayers?: boolean
    showBlocks?: boolean
    showAreas?: boolean
    declutter?: boolean
    getBlockKey?: GetBlockKey
    parkingLocations?: Geolocation[]
    lineStrings?: string[] | null

    onAction?: (map: OlMap) => void
    onRenderComplete?: () => void
  }
</script>

<script lang="ts">
  import type { Area, Geolocation } from '$lib/db/schema'
  import type { NestedArea } from '$lib/db/types'
  import { getDistance } from '$lib/geometry'
  import Feature, { type FeatureLike } from 'ol/Feature.js'
  import OlMap from 'ol/Map.js'
  import View from 'ol/View.js'
  import { Attribution, FullScreen, defaults as defaultControls } from 'ol/control.js'
  import { boundingExtent } from 'ol/extent'
  import Polyline from 'ol/format/Polyline'
  import { Geometry, LineString } from 'ol/geom'
  import Point from 'ol/geom/Point.js'
  import { fromExtent } from 'ol/geom/Polygon'
  import { DragRotateAndZoom, defaults as defaultInteractions } from 'ol/interaction.js'
  import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js'
  import 'ol/ol.css'
  import { fromLonLat } from 'ol/proj.js'
  import { Cluster, Vector as VectorSource } from 'ol/source.js'
  import OSM, { ATTRIBUTION } from 'ol/source/OSM'
  import TileWMS from 'ol/source/TileWMS.js'
  import { Fill, Stroke, Style, Text } from 'ol/style.js'
  import CircleStyle from 'ol/style/Circle'
  import { onMount } from 'svelte'
  import type { GetBlockKey, NestedBlock } from '.'
  import { pageState } from '$lib/components/Layout'
  import Geolocate from './components/Geolocate'
  import Layers, { visibleLayers, type Layer } from './components/Layers'
  import Popup from './components/Popup'

  const DEFAULT_ZOOM = 19

  let {
    collapsibleAttribution = true,
    blocks,
    selectedArea = null,
    selectedBlock = null,
    height = null,
    zoom = DEFAULT_ZOOM,
    showRegionLayers = $bindable(true),
    showBlocks = true,
    showAreas = true,
    declutter = true,
    getBlockKey = null,
    parkingLocations = [],
    lineStrings = [],
    onAction,
    onRenderComplete,
  }: BlocksMapProps = $props()

  let mapElement: HTMLDivElement | null = null
  let map: OlMap | null = $state(null)

  let selectedFeatures: FeatureData[] = $state([])

  let layersIsVisible = $state(false)
  const layers: Layer[] = [
    { label: 'OSM', name: 'osm' },
    ...pageState.userRegions.flatMap((region) =>
      (region.settings?.mapLayers ?? []).map((regionLayer) => ({
        label: regionLayer.name,
        name: regionLayer.name,
      })),
    ),
    { label: 'Markers', name: 'markers' },
  ]

  const isRootMap = showAreas && selectedArea == null && showBlocks && selectedBlock == null

  const createMap = (element: HTMLDivElement): OlMap => {
    const map = new OlMap({
      controls: defaultControls({ attribution: false }).extend([
        new FullScreen(),
        new Attribution({ collapsible: collapsibleAttribution }),
      ]),
      interactions: defaultInteractions({ doubleClickZoom: true }).extend([new DragRotateAndZoom()]),
      target: element,
      layers: [
        new TileLayer({
          properties: { layerOpts: layers.find((layer) => layer.name === 'osm') },
          source: new OSM(),
        }),
        ...pageState.userRegions.flatMap((region) =>
          (region.settings?.mapLayers ?? []).map((regionLayer) => {
            return new TileLayer(
              showRegionLayers
                ? {
                    properties: { layerOpts: layers.find((layer) => layer.name === regionLayer.name) },
                    source: new TileWMS({
                      attributions: [...(regionLayer.attributions ?? ATTRIBUTION)],
                      url: regionLayer.url,
                      params: regionLayer.params ?? {},
                    }),
                    minZoom: regionLayer.minZoom ?? undefined,
                    opacity: regionLayer.opacity ?? undefined,
                  }
                : {},
            )
          }),
        ),
      ],
      view: new View({
        center: fromLonLat([0, 0]),
        zoom: DEFAULT_ZOOM,
        constrainResolution: true,
      }),
    })

    return map
  }

  const findArea = (area: NestedArea | null | undefined, type?: Area['type']): NestedArea[] => {
    const parents = area == null ? [] : [area]
    let current = area

    while (current != null && (type == null ? true : current.type !== type)) {
      current = current.parent as NestedArea | null
      current != null && parents.unshift(current)
    }

    return parents
  }

  const createMarker = (block: (typeof blocks)[0], index: number) => {
    const parents = findArea(block.area, 'crag')

    if (block.geolocation?.lat != null && block.geolocation?.long != null) {
      const iconFeature = new Feature({
        data: {
          avatar: { src: `/blocks/${block.id}/preview-image` },
          geolocation: block.geolocation,
          subtitle: parents.map((parent) => parent.name).join(' / '),
          name: block.name,
          pathname: `/blocks/${block.id}`,
          priority: 1,
        } satisfies FeatureData,
        geometry: new Point(fromLonLat([block.geolocation.long, block.geolocation.lat])),
      })

      const iconStyle = new Style({
        image: new CircleStyle(
          getBlockKey == null
            ? {
                fill: new Fill({ color: block.id === selectedBlock?.id ? '#60a5fa' : '#ef4444' }),
                radius: selectedBlock?.id === block.id ? 8 : 6,
              }
            : {
                fill: new Fill({ color: '#ffffffaa' }),
                stroke: new Stroke({
                  color: block.id === selectedBlock?.id ? '#60a5fa' : '#ef4444',
                  width: selectedBlock?.id === block.id ? 3 : 2,
                }),
                radius: 10,
              },
        ),
        text: new Text(
          getBlockKey == null
            ? {
                backgroundFill: new Fill({ color: '#ffffff88' }),
                fill: new Fill({ color: '#000' }),
                offsetY: 25,
                padding: [4, 2, 2, 4],
                text: block.name,
              }
            : {
                fill: new Fill({ color: '#ef4444' }),
                text: String(getBlockKey(block, index)),
              },
        ),
        zIndex: showBlocks ? 0 : -1,
      })

      iconFeature.setStyle(iconStyle)

      return iconFeature
    }
  }

  const createParkingMarker = (parkingLocation: Geolocation) => {
    const iconFeature = new Feature({
      data: {
        avatar: { icon: 'fa-solid fa-parking' },
        geolocation: parkingLocation,
        name: 'Parking',
        priority: 1,
      } satisfies FeatureData,
      geometry: new Point(fromLonLat([parkingLocation.long, parkingLocation.lat])),
    })

    const iconStyle = new Style({
      text: new Text({
        backgroundFill: new Fill({ color: 'transparent' }),
        font: '900 1.75rem "Font Awesome 7 Free"',
        text: '\uf540',
        fill: new Fill({ color: '#1e40af' }),
      }),
    })

    iconFeature.setStyle(iconStyle)

    return iconFeature
  }

  const createLineStringFeatures = () => {
    const distinctLineStrings = Array.from(new Set(lineStrings))
    const style = new Style({
      stroke: new Stroke({ color: '#1e40afaa', width: 2 }),
    })

    const features = distinctLineStrings.map((path) => {
      const decodedPolyline = new Polyline({ geometryLayout: 'XY' }).readGeometry(path, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as LineString

      const feature = new Feature({
        geometry: decodedPolyline,
        type: 'route',
      })
      feature.setStyle(style)
      return feature
    })

    return features
  }

  const createSectorGeometry = (iconFeatures: Feature<Point>[]) => {
    const sectorSource = new VectorSource<Feature<Geometry>>({ features: iconFeatures })
    const extent = sectorSource.getExtent()
    let geometry = fromExtent(extent)
    let area = geometry.getArea()

    if (area < 100) {
      geometry = fromExtent([extent[0] - 10, extent[1] - 10, extent[2] + 10, extent[3] + 10])
    }

    geometry.scale(geometry.getArea() > 1000 ? 1.5 : 3)
    return geometry
  }

  const createClusterStyle = (feature: FeatureLike) => {
    const features = feature.get('features') as Feature[]

    if (features.length === 1) {
      const feature = features[0]
      const style = feature.getStyle()
      return typeof style === 'function' ? style(feature, 1) : style
    }

    const selected = features.some(
      (feature) => (feature.get('data') as FeatureData | undefined)?.pathname === `/blocks/${selectedBlock?.id}`,
    )

    return new Style({
      image: new CircleStyle({
        fill: new Fill({ color: selected ? '#60a5fa' : '#ef4444' }),
        radius: selected ? 12 : 10,
        stroke: new Stroke({ color: '#fff' }),
      }),
      text: new Text({
        fill: new Fill({ color: '#fff' }),
        font: selected ? 'bold 14px sans-serif' : '12px sans-serif',
        text: String(features.length),
      }),
    })
  }

  const createSectorMarkers = (cragBlocks: NestedBlock[]) => {
    const allSectors = cragBlocks
      .map((block) => findArea(block.area, 'sector').at(0))
      .filter((area) => area?.type === 'sector') as NestedBlock['area'][]
    const sectorsMap = new Map(allSectors.map((area) => [area.id, area]))
    const sectors = Array.from(sectorsMap.values())

    if (sectors.length === 0) {
      return cragBlocks.map(createMarker).filter((d) => d != null) as Feature<Point>[]
    }

    return sectors.flatMap((sector) => {
      const sectorBlocks = cragBlocks.filter((block) => findArea(block.area, 'sector').at(0)?.id === sector.id)
      return sectorBlocks.map(createMarker).filter((d) => d != null) as Feature<Point>[]
    })
  }

  const createSectorBoundaries = (markers: Feature<Point>[], cragBlocks: NestedBlock[]) => {
    const allSectors = cragBlocks
      .map((block) => findArea(block.area, 'sector').at(0))
      .filter((area) => area?.type === 'sector') as NestedBlock['area'][]
    const sectorsMap = new Map(allSectors.map((area) => [area.id, area]))
    const sectors = Array.from(sectorsMap.values())

    if (sectors.length === 0) {
      return []
    }

    return sectors.flatMap((sector) => {
      // Get all blocks for this sector
      const sectorBlocks = cragBlocks.filter((block) => findArea(block.area, 'sector').at(0)?.id === sector.id)

      // Find markers that belong to this sector's blocks
      const sectorMarkers = markers.filter((marker) => {
        const markerData = marker.get('data') as FeatureData
        return sectorBlocks.some((block) => markerData.pathname === `/blocks/${block.id}`)
      })

      if (sectorMarkers.length === 0) {
        return []
      }

      const parents = findArea(sector)
      const geometry = createSectorGeometry(sectorMarkers)

      return [
        new Feature({
          data: {
            name: sector.name,
            pathname: `/areas/${sector.id}`,
            priority: 2,
            subtitle: parents
              .map((parent) => parent.name)
              .slice(0, -1)
              .join(' / '),
          } satisfies FeatureData,
          geometry,
          text: sector.name,
        }),
      ]
    })
  }

  const createCragLayer = (map: OlMap, crag: NestedBlock['area']) => {
    const cragBlocks = blocks.filter((block) => findArea(block.area, 'crag').at(0)?.id === crag.id)
    const markers = createSectorMarkers(cragBlocks)

    if (markers.length === 0) {
      return
    }

    // Create clustered markers layer
    const vectorSource = new VectorSource<Feature<Geometry>>()
    vectorSource.addFeatures(markers)

    const clusterSource = new Cluster({
      distance: 40,
      minDistance: 20,
      source: vectorSource,
    })

    map.on('moveend', () => {
      const zoom = map.getView().getZoom()

      if (zoom != null && zoom > 17) {
        clusterSource.setDistance(0)
        clusterSource.setMinDistance(0)
      } else {
        clusterSource.setDistance(40)
        clusterSource.setMinDistance(20)
      }
    })

    const markersLayer = new VectorLayer({
      properties: { layerOpts: layers.find((layer) => layer.name === 'markers') },
      source: declutter ? clusterSource : vectorSource,
      style: declutter ? createClusterStyle : undefined,
    })

    // Create sector boundaries layer
    const sectorFeatures = createSectorBoundaries(markers, cragBlocks)
    const sectorsSource = new VectorSource<Feature<Geometry>>()
    sectorsSource.addFeatures(sectorFeatures)

    // Add crag boundary
    const cragGeometry = createSectorGeometry(markers)
    sectorsSource.addFeature(
      new Feature({
        geometry: cragGeometry,
        text: crag.name,
      }),
    )

    const sectorsLayer = new VectorLayer({
      declutter,
      maxZoom: declutter ? 14 : undefined,
      properties: { layerOpts: layers.find((layer) => layer.name === 'markers'), name: crag.name },
      source: sectorsSource,
      style: showAreas
        ? {
            'stroke-color': 'rgba(49, 57, 68, 1)',
            'stroke-width': 1,
            'fill-color': 'rgba(255, 255, 255, 0.2)',
            'text-value': ['get', 'text'],
            'text-font': 'bold 14px sans-serif',
            'text-offset-y': -12,
            'text-overflow': true,
          }
        : {
            'stroke-color': 'transparent',
            'fill-color': 'transparent',
          },
    })

    map.addLayer(sectorsLayer)
    map.addLayer(markersLayer)
  }

  const createMarkers = (map: OlMap) => {
    const parkingLocationsMap = new Map(parkingLocations.map((location) => [location.id, location]))
    const distinctParkingLocations = Array.from(parkingLocationsMap.values())
    const parkingIconFeatures = distinctParkingLocations.map(createParkingMarker)
    const vectorSource = new VectorSource<Feature<Geometry>>({ features: parkingIconFeatures })

    const lineStringFeatures = createLineStringFeatures()
    vectorSource.addFeatures(lineStringFeatures)

    const vectorLayer = new VectorLayer({
      properties: { layerOpts: layers.find((layer) => layer.name === 'markers') },
      source: vectorSource,
      minZoom: declutter ? 14 : undefined,
    })
    map.addLayer(vectorLayer)

    const allCrags = blocks
      .map((block) => findArea(block.area, 'crag').at(0))
      .filter((d) => d != null) as NestedBlock['area'][]
    const cragsMap = new Map(allCrags.map((area) => [area.id, area]))
    const crags = Array.from(cragsMap.values())

    crags.forEach((area) => createCragLayer(map, area))
  }

  const createPopup = (map: OlMap) => {
    map.on('click', function (event) {
      if (((event.originalEvent as Event).target as HTMLElement).tagName.toLowerCase() === 'a') {
        return
      }

      selectedFeatures = map
        .getFeaturesAtPixel(event.pixel)
        .flatMap((feature) => (feature.get('features') as FeatureLike[] | undefined) ?? feature)
        .filter((feature) => feature.get('data')?.priority != null)
        .toSorted((a, b) => Number(a.get('data')?.priority) - Number(b.get('data')?.priority))
        .map((feature) => feature.get('data') as FeatureData)
        .filter(Boolean)
        .slice(0, 5)
    })

    map.on('pointermove', function (event) {
      const target = map.getTarget()

      if (target == null || typeof target === 'string') {
        return
      }

      const pixel = map.getEventPixel(event.originalEvent)
      const features = map
        .getFeaturesAtPixel(pixel)
        .flatMap((feature) => (feature.get('features') as FeatureLike[] | undefined) ?? feature)
      const hit = features.some((feature) => feature.get('data')?.priority != null)

      target.style.cursor = hit ? 'pointer' : ''
    })

    map.on('pointerdrag', () => {
      layersIsVisible = false
      selectedFeatures = []
    })
  }

  const centerMap = (map: OlMap) => {
    map.once('rendercomplete', () => {
      resizeMap()

      const selectedBlocks = blocks.filter((block) => {
        if (selectedBlock?.id === block.id) {
          return true
        }

        if (selectedArea?.id != null) {
          const parentIds = findArea(block.area).map((area) => area.id)
          return parentIds.includes(selectedArea.id)
        }

        return false
      })

      const blocksToDisplay = selectedBlocks.length === 0 ? blocks : selectedBlocks
      const coordinates = blocksToDisplay
        .filter((block) => block.geolocation?.lat != null && block.geolocation!.long != null)
        .map((block) => fromLonLat([block.geolocation!.long, block.geolocation!.lat]))

      const selectedParkingLocations = parkingLocations.filter((parkingLocation) => {
        if (selectedBlock != null) {
          return false
        }

        if (selectedArea == null) {
          return true
        }

        return parkingLocation.areaFk === selectedArea.id
      })

      coordinates.push(
        ...selectedParkingLocations.map((parkingLocation) => fromLonLat([parkingLocation.long, parkingLocation.lat])),
      )

      if (isRootMap) {
        const sorted = coordinates.toSorted(
          (a, b) =>
            getDistance({ x: a[0], y: a[1] }, { x: 0, y: 0 }) - getDistance({ x: b[0], y: b[1] }, { x: 0, y: 0 }),
        )
        const median = sorted.at(Math.floor(sorted.length / 2))

        if (median != null) {
          const filtered = coordinates.filter(
            (coordinate) =>
              getDistance({ x: coordinate[0], y: coordinate[1] }, { x: median[0], y: median[1] }) < 200_000,
          )

          const extent = boundingExtent(filtered)

          map.getView().fit(extent, {
            callback: () => onRenderComplete?.(),
            maxZoom: zoom ?? DEFAULT_ZOOM,
          })
        }
      } else {
        const extent = boundingExtent(coordinates)

        map.getView().fit(extent, {
          callback: () => onRenderComplete?.(),
          maxZoom: zoom ?? DEFAULT_ZOOM,
        })
      }
    })
  }

  const mapAction = (el: HTMLDivElement) => {
    mapElement = el
    map = createMap(el)
    createMarkers(map)
    createPopup(map)
    centerMap(map)
    resizeMap()

    const observer = new ResizeObserver(() => requestAnimationFrame(resizeMap))
    observer.observe(el)

    onAction?.(map)

    return {
      destroy: () => {
        // map?.remove()
        mapElement = null
        map = null
        observer.disconnect()
      },
    }
  }

  function resizeMap() {
    if (mapElement != null) {
      if (height == null) {
        const bcr = mapElement.parentElement?.getBoundingClientRect()

        if (bcr != null) {
          mapElement.style.height = `${bcr.height}px`
        }
      } else if (typeof height === 'number') {
        mapElement.style.height = `${height}px`
      } else {
        mapElement.style.height = height
      }
    }
  }

  const onChangeRelief = (layers: string[]) => {
    map
      ?.getAllLayers()
      .filter((layer) => layer.get('layerOpts') != null)
      .map((layer) => {
        const opts = layer.get('layerOpts')
        const isVisible = layers.includes(opts.name)
        layer.setVisible(isVisible)
      })
  }

  onMount(() => {
    const unsubscribe = visibleLayers.subscribe((value) => {
      let newValue = value ?? layers.map((layer) => layer.name)

      if (value == null) {
        visibleLayers.set(newValue)
      }

      onChangeRelief(newValue)
    })

    return () => {
      unsubscribe()
    }
  })
</script>

<div class="relative flex h-full">
  <!-- svelte-ignore a11y_positive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="map -z-0 w-full" tabindex="1" use:mapAction>
    <div class="relative z-10 {'ontouchstart' in window ? ' ol-touch' : ''}">
      <div class="ol-control ol-layers">
        <button
          aria-label="Map layers"
          onclick={() => (layersIsVisible = !layersIsVisible)}
          title="Map layers"
          type="button"
        >
          <i class="fa-solid fa-layer-group text-sm {layersIsVisible ? 'text-primary-500' : ''}"></i>
        </button>

        {#if layersIsVisible}
          <Layers {layers} />
        {/if}
      </div>

      <div class="ol-control ol-geolocate">
        <Geolocate {map} />
      </div>
    </div>

    <Popup features={selectedFeatures} />
  </div>
</div>

<style>
  :root {
    --ol-control-height: 1.375em;
    --ol-control-margin: 0.5em;

    @media (pointer: coarse) {
      --ol-control-height: 2em;
    }
  }

  :global(.ol-zoom) {
    left: initial;
    right: var(--ol-control-margin);
    top: var(--ol-control-margin);
  }

  :global(.ol-full-screen) {
    left: initial;
    right: var(--ol-control-margin);
    top: calc(
      var(--ol-control-margin) + var(--ol-control-height) + var(--ol-control-height) + var(--ol-control-margin)
    );
  }

  :global(.ol-rotate) {
    left: initial;
    right: var(--ol-control-margin);
    top: calc(
      var(--ol-control-margin) + var(--ol-control-height) + var(--ol-control-height) + var(--ol-control-margin) +
        var(--ol-control-height) + var(--ol-control-margin)
    );
    opacity: 1 !important;
    visibility: visible !important;
  }

  .ol-layers {
    right: var(--ol-control-margin);
    top: calc(
      var(--ol-control-margin) + var(--ol-control-height) + var(--ol-control-height) + var(--ol-control-margin) +
        var(--ol-control-height) + var(--ol-control-margin) + var(--ol-control-height) + var(--ol-control-margin)
    );
  }

  .ol-geolocate {
    right: var(--ol-control-margin);
    top: calc(
      var(--ol-control-margin) + var(--ol-control-height) + var(--ol-control-height) + var(--ol-control-margin) +
        var(--ol-control-height) + var(--ol-control-margin) + var(--ol-control-height) + var(--ol-control-margin) +
        var(--ol-control-height) + var(--ol-control-margin)
    );
  }

  @media print {
    .ol-layers,
    .ol-geolocate,
    :global(.ol-zoom),
    :global(.ol-full-screen),
    :global(.ol-rotate) {
      display: none;
    }
  }
</style>
