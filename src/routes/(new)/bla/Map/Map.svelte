<script lang="ts" module>
  export type { BlocksMapProps, MapFocus, NestedBlock } from './types'
</script>

<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import BottomSheetPanel from '$lib/components/BottomSheetPanel'
  import { pageState } from '$lib/components/Layout'
  import { getI18n } from '$lib/i18n'
  import OlGeolocation from 'ol/Geolocation.js'
  import OlMap from 'ol/Map.js'
  import View from 'ol/View.js'
  import { Attribution, defaults as defaultControls } from 'ol/control.js'
  import { boundingExtent } from 'ol/extent'
  import { Tile as TileLayer } from 'ol/layer.js'
  import 'ol/ol.css'
  import { fromLonLat, toLonLat } from 'ol/proj.js'
  import OSM from 'ol/source/OSM'
  import type { Attachment } from 'svelte/attachments'
  import { createMapData } from './data.svelte'
  import { setupGeolocation } from './geolocation'
  import {
    createBlockLayer,
    createCragLayer,
    createParkingLayer,
    createPathLayer,
    createSectorLayer,
    createWmsLayers,
  } from './layers.svelte'
  import { BLOCK_LABEL_ZOOM, type BlocksMapProps, type LayerEntry } from './types'

  const { t } = getI18n()

  const props: BlocksMapProps = $props()

  const data = createMapData({
    get blocks() {
      return props.blocks
    },
    get parkingLocations() {
      return props.parkingLocations
    },
    get lineStrings() {
      return props.lineStrings
    },
    get routeCountByBlock() {
      return props.routeCountByBlock
    },
  })

  let map = $state<OlMap>()
  let isTrackingGeolocation = $state(false)
  let isGeolocationError = $state(false)
  let isFullscreen = $state(false)
  let isLayersSheetOpen = $state(false)
  let layerEntries = $state<LayerEntry[]>([])

  $effect(() => {
    const focus = props.focus
    if (map == null || focus == null) return

    if (focus.extent) {
      // Fit to geographic extent [minLat, minLng, maxLat, maxLng]
      const min = fromLonLat([focus.extent[1], focus.extent[0]])
      const max = fromLonLat([focus.extent[3], focus.extent[2]])
      map.getView().fit([min[0], min[1], max[0], max[1]], {
        padding: focus.padding ?? [50, 50, 50, 50],
        maxZoom: focus.zoom ?? BLOCK_LABEL_ZOOM,
        duration: 300,
      })
    } else if (focus.center) {
      const center = fromLonLat([focus.center[1], focus.center[0]])
      const zoom = focus.zoom ?? BLOCK_LABEL_ZOOM

      if (focus.padding) {
        map.getView().fit([center[0], center[1], center[0], center[1]], {
          padding: focus.padding,
          maxZoom: zoom,
          duration: 300,
        })
      } else {
        map.getView().animate({ center, zoom, duration: 300 })
      }
    }
  })

  const handleGeolocate = () => {
    if (map == null) return
    const geolocation = map.get('geolocation') as OlGeolocation | undefined
    if (geolocation == null) return
    isTrackingGeolocation = true
    geolocation.setTracking(true)
  }

  const handleZoomIn = () => {
    if (map == null) return
    const view = map.getView()
    const zoom = view.getZoom()
    if (zoom != null) view.animate({ zoom: zoom + 1, duration: 200 })
  }

  const handleZoomOut = () => {
    if (map == null) return
    const view = map.getView()
    const zoom = view.getZoom()
    if (zoom != null) view.animate({ zoom: zoom - 1, duration: 200 })
  }

  const handleFullscreen = () => {
    const el = document.querySelector('.map-container') as HTMLElement | null
    if (el == null) return

    if (!document.fullscreenElement) {
      void el.requestFullscreen()
      isFullscreen = true
    } else {
      void document.exitFullscreen()
      isFullscreen = false
    }
  }

  const handleToggleLayer = (name: string) => {
    if (map == null) return
    const layers = map
      .getLayers()
      .getArray()
      .filter((l) => l.get('layerName') === name)
    if (layers.length === 0) return

    const newVisible = !layers[0].getVisible()
    layers.forEach((layer) => layer.setVisible(newVisible))
    layerEntries = layerEntries.map((entry) => (entry.name === name ? { ...entry, visible: newVisible } : entry))
  }

  const getLayerIconClass = (layerName: string, markersLabel: string): string => {
    const normalizedLayerName = layerName.trim().toLowerCase()
    if (normalizedLayerName === 'osm' || normalizedLayerName === 'openstreetmap') {
      return 'fa-solid fa-map'
    }
    if (layerName === markersLabel) {
      return 'fa-solid fa-location-dot'
    }
    return 'fa-solid fa-layer-group'
  }

  const mapAttachment: Attachment = (node) => {
    const wmsLayers = createWmsLayers(pageState.userRegions)

    const mapInstance = new OlMap({
      controls: defaultControls({ attribution: false, zoom: false, rotate: false }).extend([
        new Attribution({ collapsible: true }),
      ]),
      target: node as HTMLElement,
      layers: [new TileLayer({ source: new OSM(), properties: { layerName: 'OpenStreetMap' } }), ...wmsLayers],
      view: new View({
        center: fromLonLat([data.medianCenter[1], data.medianCenter[0]]),
        zoom: 13,
        constrainResolution: true,
      }),
    })
    map = mapInstance

    const cragLayer = createCragLayer(data.cragBoundingBoxes, data.blocksByCrag, data.routeCountByCrag)
    const sectorLayer = createSectorLayer(data.sectorBoundingBoxes, data.blocksBySector, data.routeCountBySector)
    const blockLayer = createBlockLayer(data.geoBlocks, mapInstance, data.routeCountByBlock)
    const parkingLayer = createParkingLayer(data.uniqueParkingLocations)
    const pathLayer = createPathLayer(data.uniqueLineStrings)

    const markersLabel = t('map.markers')
    cragLayer.set('layerName', markersLabel)
    sectorLayer.set('layerName', markersLabel)
    blockLayer.set('layerName', markersLabel)
    parkingLayer.set('layerName', markersLabel)
    pathLayer.set('layerName', markersLabel)

    mapInstance.addLayer(cragLayer)
    mapInstance.addLayer(sectorLayer)
    mapInstance.addLayer(blockLayer)
    mapInstance.addLayer(parkingLayer)
    mapInstance.addLayer(pathLayer)

    // Populate layer entries for the toggle panel
    const seenLayers = new Set<string>()
    layerEntries = mapInstance
      .getLayers()
      .getArray()
      .map((layer) => {
        const layerName = layer.get('layerName') as string
        return {
          name: layerName,
          icon: getLayerIconClass(layerName, markersLabel),
          label: layerName,
          visible: layer.getVisible(),
        }
      })
      .filter((entry) => {
        if (entry.name == null || seenLayers.has(entry.name)) return false
        seenLayers.add(entry.name)
        return true
      })

    // Click navigation
    mapInstance.on('click', (event) => {
      const feature = mapInstance.forEachFeatureAtPixel(event.pixel, (f) => f)
      if (feature) {
        const blockId = feature.get('blockId')
        const areaId = feature.get('areaId')
        if (blockId != null) {
          goto(resolve('/(new)/bla/(modal)/blocks/[id]', { id: blockId.toString() }))
        } else if (areaId != null) {
          goto(resolve('/(new)/bla/(modal)/areas/[id]', { id: areaId.toString() }))
        }
      }
    })

    // Pointer cursor for blocks
    mapInstance.on('pointermove', (event) => {
      const target = mapInstance.getTarget()
      if (target == null || typeof target === 'string') return
      const hit = mapInstance.hasFeatureAtPixel(event.pixel, {
        layerFilter: (layer) => layer === blockLayer || layer === cragLayer || layer === sectorLayer,
      })
      target.style.cursor = hit ? 'pointer' : ''
    })

    const handleMoveEnd = () => {
      const view = mapInstance.getView()
      const center = view.getCenter()
      if (center == null) return

      const [lng, lat] = toLonLat(center)
      const zoom = view.getZoom() ?? BLOCK_LABEL_ZOOM
      props.onviewchange?.({ center: [lat, lng], zoom })
    }
    mapInstance.on('moveend', handleMoveEnd)

    // Center map on median of block coordinates
    if (data.geoBlocks.length > 0) {
      const coords = data.geoBlocks.map((b) => fromLonLat([b.geolocation!.long, b.geolocation!.lat]))
      const sorted = coords.toSorted((a, b) => Math.sqrt(a[0] ** 2 + a[1] ** 2) - Math.sqrt(b[0] ** 2 + b[1] ** 2))
      const median = sorted[Math.floor(sorted.length / 2)]

      const filtered = coords.filter((c) => {
        const d = Math.sqrt((c[0] - median[0]) ** 2 + (c[1] - median[1]) ** 2)
        return d < 200_000
      })

      if (filtered.length > 0) {
        const extent = boundingExtent(filtered)
        mapInstance.getView().fit(extent, { maxZoom: 15 })
      } else {
        mapInstance.getView().setCenter(median)
        mapInstance.getView().setZoom(13)
      }
    }

    // Refresh block labels on zoom change
    let lastLabelState = false
    mapInstance.getView().on('change:resolution', () => {
      const zoom = mapInstance.getView().getZoom() ?? 0
      const showLabels = zoom >= BLOCK_LABEL_ZOOM
      if (showLabels !== lastLabelState) {
        lastLabelState = showLabels
        blockLayer.changed()
      }
    })

    // Geolocation
    const cleanupGeolocation = setupGeolocation(mapInstance, {
      getIsTracking: () => isTrackingGeolocation,
      setIsTracking: (v) => (isTrackingGeolocation = v),
      setIsError: (v) => (isGeolocationError = v),
    })

    // Fullscreen
    const onFullscreenChange = () => {
      isFullscreen = !!document.fullscreenElement
      mapInstance.updateSize()
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)

    // Resize
    const observer = new ResizeObserver(() => mapInstance.updateSize())
    observer.observe(node as HTMLElement)

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      observer.disconnect()
      mapInstance.un('moveend', handleMoveEnd)
      cleanupGeolocation()
      mapInstance.setTarget(undefined)
      mapInstance.dispose()
      map = undefined
    }
  }
</script>

<div class="map-container relative z-10 h-full">
  <div class="h-full" {@attach mapAttachment}></div>

  <div class="absolute right-2 bottom-2 z-20 flex flex-col gap-1">
    <button class="preset-filled-surface-200-800 btn-icon" onclick={handleZoomIn} aria-label={t('map.zoomIn')}>
      <i class="fa-solid fa-plus text-sm"></i>
    </button>

    <button class="preset-filled-surface-200-800 btn-icon" onclick={handleZoomOut} aria-label={t('map.zoomOut')}>
      <i class="fa-solid fa-minus text-sm"></i>
    </button>

    <div class="h-8"></div>

    <button
      class="preset-filled-surface-200-800 btn-icon"
      onclick={handleGeolocate}
      aria-label={t('map.showMyLocation')}
    >
      <i
        class="fa-solid fa-location-crosshairs text-sm"
        class:text-primary-500={isTrackingGeolocation}
        class:text-error-500={isGeolocationError}
      ></i>
    </button>

    <button
      class="preset-filled-surface-200-800 btn-icon"
      onclick={handleFullscreen}
      aria-label={t('map.toggleFullscreen')}
    >
      <i class="fa-solid text-sm" class:fa-expand={!isFullscreen} class:fa-compress={isFullscreen}></i>
    </button>

    <button
      class="preset-filled-surface-200-800 btn-icon"
      onclick={() => (isLayersSheetOpen = !isLayersSheetOpen)}
      aria-label={t('map.toggleLayers')}
    >
      <i class="fa-solid fa-layer-group text-sm" class:text-primary-500={isLayersSheetOpen}></i>
    </button>
  </div>
</div>

<BottomSheetPanel bind:isSheetOpen={isLayersSheetOpen} autoHeight title={t('map.layers')}>
  <div class="mt-4 flex flex-wrap justify-around gap-2">
    {#each layerEntries as entry (entry.name)}
      <button
        aria-label={entry.label}
        aria-pressed={entry.visible}
        class="flex w-25 flex-col items-center justify-center gap-1"
        onclick={() => handleToggleLayer(entry.name)}
      >
        <div
          class={[
            'color-primary-500 flex h-25 w-25 items-center justify-center rounded-lg transition-colors',
            entry.visible ? 'preset-filled-primary-500' : 'border-surface-500/30 border',
          ]}
        >
          <i class={['text-6xl transition-colors', entry.icon, !entry.visible && 'text-surface-500/30']}></i>
        </div>
        <span
          class={[
            'w-25 truncate overflow-hidden text-xs text-ellipsis transition-colors',
            entry.visible ? 'text-primary-500' : 'text-surface-500',
          ]}
        >
          {entry.label}
        </span>
      </button>
    {/each}
  </div>
</BottomSheetPanel>

<style>
  :global(.geolocation-marker) {
    width: 16px;
    height: 16px;
    background-color: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
  }

  .map-container :global(.ol-attribution) {
    bottom: 2px;
    right: auto;
    left: 2px;
  }
</style>
