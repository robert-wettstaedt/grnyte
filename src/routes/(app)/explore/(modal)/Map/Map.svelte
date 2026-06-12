<script lang="ts" module>
  export type { BlocksMapProps, MapFocus } from './types'
</script>

<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
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
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'

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
  let mapHasSize = $state(false)
  let isTrackingGeolocation = $state(false)
  let isGeolocationError = $state(false)
  let isFullscreen = $state(false)
  let isLayersSheetOpen = $state(false)
  let layerEntries = $state<LayerEntry[]>([])
  let hasAutoFitted = $state(false)

  $effect(() => {
    if (map == null || !mapHasSize || hasAutoFitted || props.focus != null) return
    const blocks = data.geoBlocks
    if (blocks.length === 0) return

    hasAutoFitted = true
    const coords = blocks.map((b) => fromLonLat([b.geolocation!.long, b.geolocation!.lat]))
    const sorted = coords.toSorted((a, b) => Math.sqrt(a[0] ** 2 + a[1] ** 2) - Math.sqrt(b[0] ** 2 + b[1] ** 2))
    const median = sorted[Math.floor(sorted.length / 2)]
    const filtered = coords.filter((c) => Math.sqrt((c[0] - median[0]) ** 2 + (c[1] - median[1]) ** 2) < 200_000)

    if (filtered.length > 0) {
      map.getView().fit(boundingExtent(filtered), { maxZoom: 15 })
    } else {
      map.getView().setCenter(median)
      map.getView().setZoom(13)
    }
  })

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

  const getLayerIcon = (layerName: string, markersLabel: string): IconName => {
    const normalizedLayerName = layerName.trim().toLowerCase()
    if (normalizedLayerName === 'osm' || normalizedLayerName === 'openstreetmap') {
      return 'map'
    }
    if (layerName === markersLabel) {
      return 'map-pin'
    }
    return 'layers'
  }

  const mapAttachment: Attachment = (node) => {
    // const wmsLayers = createWmsLayers(pageState.userRegions)

    const mapInstance = new OlMap({
      controls: defaultControls({ attribution: false, zoom: false, rotate: false }).extend([
        new Attribution({ collapsible: true }),
      ]),
      target: node as HTMLElement,
      layers: [
        new TileLayer({ source: new OSM(), properties: { layerName: 'OpenStreetMap' } }),
        // ...wmsLayers
      ],
      view: new View({
        center: fromLonLat([2.6117597, 48.4103865]),
        zoom: 4,
        constrainResolution: true,
      }),
    })
    map = mapInstance

    const cragLayer = createCragLayer(data.cragBoundingBoxes, data.blocksByCrag, data.routeCountByCrag)
    const sectorLayer = createSectorLayer(data.sectorBoundingBoxes, data.blocksBySector, data.routeCountBySector)
    const blockLayer = createBlockLayer(data.geoBlocks, mapInstance, data.routeCountByBlock)
    const parkingLayer = createParkingLayer(data.uniqueParkingLocations)
    const pathLayer = createPathLayer(data.uniqueLineStrings)

    const markersLabel = m.map_markers()
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
          icon: getLayerIcon(layerName, markersLabel),
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
        const parkingId = feature.get('parkingId')
        // if (blockId != null) {
        //   goto(resolve('/(new)/bla/(modal)/blocks/[id]', { id: blockId.toString() }))
        // } else if (areaId != null) {
        //   goto(resolve('/(new)/bla/(modal)/areas/[id]', { id: areaId.toString() }))
        // } else if (parkingId != null) {
        //   goto(resolve('/(new)/bla/(modal)/parking/[id]', { id: parkingId.toString() }))
        // }
      }
    })

    // Pointer cursor for blocks
    mapInstance.on('pointermove', (event) => {
      const target = mapInstance.getTarget()
      if (target == null || typeof target === 'string') return
      const hit = mapInstance.hasFeatureAtPixel(event.pixel, {
        layerFilter: (layer) =>
          layer === blockLayer || layer === cragLayer || layer === sectorLayer || layer === parkingLayer,
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
    const observer = new ResizeObserver(() => {
      mapInstance.updateSize()
      const size = mapInstance.getSize()
      if (!mapHasSize && size != null && size[0] > 0 && size[1] > 0) {
        mapHasSize = true
      }
    })
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
  <div class="map h-full" {@attach mapAttachment}></div>

  <div class="absolute right-2 bottom-20.5 z-20 mb-10 flex flex-col gap-1 md:bottom-2">
    <button class="btn-icon preset-filled-surface-100-900" onclick={handleZoomIn} aria-label={m.map_zoomIn()}>
      <Icon name="plus" size={16} />
    </button>

    <button class="btn-icon preset-filled-surface-100-900" onclick={handleZoomOut} aria-label={m.map_zoomOut()}>
      <Icon name="minus" size={16} />
    </button>

    <div class="h-8"></div>

    <button
      aria-label={m.map_showMyLocation()}
      class={[
        'btn-icon',
        isTrackingGeolocation
          ? 'preset-filled-primary-500'
          : isGeolocationError
            ? 'preset-filled-error-500'
            : 'preset-filled-surface-100-900',
      ]}
      onclick={handleGeolocate}
    >
      <Icon name="locate" size={16} />
    </button>

    <button
      aria-label={m.map_toggleFullscreen()}
      class={['btn-icon', isFullscreen ? 'preset-filled-primary-500' : 'preset-filled-surface-100-900']}
      onclick={handleFullscreen}
    >
      <Icon name={isFullscreen ? 'collapse' : 'expand'} size={16} />
    </button>

    <Modal bind:open={isLayersSheetOpen} popoverProps={{ positioning: { placement: 'left' } }} title={m.map_layers()}>
      {#snippet trigger(props)}
        <button
          {...props}
          aria-label={m.map_toggleLayers()}
          class={[
            props.class,
            'btn-icon',
            isLayersSheetOpen ? 'preset-filled-primary-500' : 'preset-filled-surface-100-900',
          ]}
          onclick={() => (isLayersSheetOpen = !isLayersSheetOpen)}
        >
          <Icon name="layers" size={16} />
        </button>
      {/snippet}

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
              <Icon
                name={entry.icon}
                size={60}
                class={['transition-colors', !entry.visible && 'text-surface-500/30']}
              />
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
    </Modal>

    <div class="h-8"></div>
  </div>
</div>

<style>
  /* Quiet dark map: OSM raster tiles inverted and desaturated in dark mode. */
  :global(.dark) .map :global(.ol-layers) {
    filter: invert(1) hue-rotate(180deg) saturate(0.4) brightness(0.9) contrast(0.95);
  }

  :global(.geolocation-marker) {
    width: 16px;
    height: 16px;
    background-color: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
  }

  .map-container :global(.ol-attribution) {
    bottom: calc(var(--spacing) * 20.5);
    left: auto;
    right: calc(var(--spacing) * 2);
    height: calc(var(--text-base) * 2);
    background: var(--color-surface-100-900);
    padding-top: calc(var(--spacing) * 2);
    padding-bottom: calc(var(--spacing) * 2);

    @media (min-width: 768px) {
      bottom: calc(var(--spacing) * 4);
    }
  }

  .map-container :global(.ol-attribution button) {
    align-items: center;
    background: var(--color-surface-100-900);
    border-radius: var(--radius-base);
    box-sizing: content-box;
    color: var(--color-surface-contrast-100-900);
    display: inline-flex;
    font-size: var(--text-base);
    height: var(--text-base);
    justify-content: center;
    outline: none;
    padding: calc(var(--spacing) * 2);
    text-decoration-line: none;
    white-space: nowrap;
    width: var(--text-base);

    &:hover {
      filter: brightness(75%);
    }
  }

  .map-container :global(.ol-attribution ul) {
    color: var(--color-surface-contrast-100-900);
    text-shadow: none;
  }

  .map-container :global(.ol-attribution a) {
    color: var(--color-blue-500);
  }
</style>
