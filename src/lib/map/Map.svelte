<script lang="ts">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'
  import { boundingExtent } from 'ol/extent'
  import type Feature from 'ol/Feature.js'
  import OlGeolocation from 'ol/Geolocation.js'
  import type VectorLayer from 'ol/layer/Vector.js'
  import type OlMap from 'ol/Map.js'
  import { fromLonLat, toLonLat } from 'ol/proj.js'
  import { untrack } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import { parseCredit } from './attribution'
  import { createBaseMap } from './base.svelte'
  import { createMapData } from './data.svelte'
  import { setupGeolocation } from './geolocation'
  import {
    buildAreaFeatures,
    buildBlockFeatures,
    buildParkingFeatures,
    buildPathFeatures,
    buildSectorFeatures,
    createAreaLayer,
    createBlockLayer,
    createDrawnPathLayer,
    createParkingLayer,
    createPathLayer,
    createSectorLayer,
    createWmsLayers,
  } from './layers.svelte'
  import { BLOCK_LABEL_ZOOM, type BlocksMapProps, type LayerEntry } from './types'

  const props: BlocksMapProps = $props()

  const data = createMapData({
    get blocks() {
      return props.blocks
    },
    get gradeCountByBlock() {
      return props.gradeCountByBlock
    },
    get lineStrings() {
      return props.lineStrings
    },
    get parkingLocations() {
      return props.parkingLocations
    },
    get routeCountByBlock() {
      return props.routeCountByBlock
    },
  })

  let map = $state<OlMap>()
  // The base map owns the size latch: fitting before layout lands on a nonsense zoom.
  let baseMap = $state<ReturnType<typeof createBaseMap>>()
  const mapHasSize = $derived(baseMap?.hasSize === true)
  let isTrackingGeolocation = $state(false)
  let geolocationErrorCode = $state<number>()
  let isLayersSheetOpen = $state(false)
  let isAttributionOpen = $state(false)
  let layerEntries = $state<LayerEntry[]>([])
  let hasAutoFitted = $state(false)
  // Visibility of the "Markers" group, tracked separately so the toggle state is
  // re-applied if the layers are ever recreated (e.g. the map remounts).
  let markersVisible = $state(true)

  // Plain (non-reactive) on purpose: captured on moveend so that if the map is ever
  // rebuilt (a genuine remount), its View can be reseeded from the last position
  // instead of snapping back to the initial world view.
  let savedView: undefined | { center: number[]; zoom: number }

  const global = getGlobalState()

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

  // The last focus applied to the view, so equal-valued recomputations are skipped.
  let lastFocusKey: string | undefined
  $effect(() => {
    const focus = props.focus
    if (map == null || focus == null) return

    // The parent recomputes `focus` (a fresh object) on every map-data change; re-fitting
    // the view each time would re-frame the map and undo any manual pan. Only move when the
    // target changed.
    const focusKey = JSON.stringify(focus)
    if (focusKey === lastFocusKey) return
    lastFocusKey = focusKey

    if (focus.extent) {
      // Fit to geographic extent [minLat, minLng, maxLat, maxLng]
      const min = fromLonLat([focus.extent[1], focus.extent[0]])
      const max = fromLonLat([focus.extent[3], focus.extent[2]])
      map.getView().fit([min[0], min[1], max[0], max[1]], {
        duration: 300,
        maxZoom: focus.zoom ?? BLOCK_LABEL_ZOOM,
        padding: focus.padding ?? [50, 50, 50, 50],
      })
    } else if (focus.center) {
      const center = fromLonLat([focus.center[1], focus.center[0]])
      const zoom = focus.zoom ?? BLOCK_LABEL_ZOOM

      if (focus.padding) {
        map.getView().fit([center[0], center[1], center[0], center[1]], {
          duration: 300,
          maxZoom: zoom,
          padding: focus.padding,
        })
      } else {
        map.getView().animate({ center, duration: 300, zoom })
      }
    }
  })

  // The data layers are created once and added to the map, then each is kept in sync
  // with its slice of `data` by its own effect below. A data change re-renders only the
  // one layer whose features changed (layers are never torn down and rebuilt), so a Zero
  // sync from another client no longer flashes the whole map (and the donut icons, which
  // are expensive to regenerate, aren't reloaded unless their own area/sector changed).
  let areaLayer = $state<VectorLayer>()
  let sectorLayer = $state<VectorLayer>()
  let blockLayer = $state<VectorLayer>()
  let parkingLayer = $state<VectorLayer>()
  let pathLayer = $state<VectorLayer>()

  $effect(() => {
    const mapInstance = map
    if (mapInstance == null) return

    const area = createAreaLayer()
    const sector = createSectorLayer()
    const block = createBlockLayer(mapInstance, () => props.selectedBlockId)
    const parking = createParkingLayer()
    const path = createPathLayer()

    const markersLabel = m.map_markers()
    const dataLayers = [area, sector, block, parking, path]
    for (const layer of dataLayers) {
      layer.set('layerName', markersLabel)
      // Apply the current toggle state without depending on it (toggling handles the
      // live layers directly).
      layer.setVisible(untrack(() => markersVisible))
    }
    // Navigable markers (everything except the path lines) drive the pointer cursor.
    for (const layer of [area, sector, block, parking]) {
      layer.set('clickable', true)
    }
    block.set('isBlockLayer', true)

    for (const layer of dataLayers) {
      mapInstance.addLayer(layer)
    }
    areaLayer = area
    sectorLayer = sector
    blockLayer = block
    parkingLayer = parking
    pathLayer = path

    // Toggle panel: the base layers (OSM + WMS) plus the single "Markers" group.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe, not reactive state
    const seenLayers = new Set<string>()
    layerEntries = mapInstance
      .getLayers()
      .getArray()
      .map((layer) => {
        const layerName = layer.get('layerName') as string
        return {
          icon: getLayerIcon(layerName, markersLabel),
          label: layerName,
          name: layerName,
          visible: layer.getVisible(),
        }
      })
      .filter((entry) => {
        if (entry.name == null || seenLayers.has(entry.name)) return false
        seenLayers.add(entry.name)
        return true
      })

    return () => {
      for (const layer of dataLayers) {
        mapInstance.removeLayer(layer)
      }
      areaLayer = undefined
      sectorLayer = undefined
      blockLayer = undefined
      parkingLayer = undefined
      pathLayer = undefined
    }
  })

  // Replace a stable layer's features in place: one re-render of only that layer, no
  // teardown, so unrelated layers never flicker when this slice of data changes.
  const syncFeatures = (layer: undefined | VectorLayer, features: Feature[]) => {
    const source = layer?.getSource()
    if (source == null) return
    source.clear()
    source.addFeatures(features)
  }

  $effect(() =>
    syncFeatures(areaLayer, buildAreaFeatures(data.areaBoundingBoxes, data.routeCountByArea, data.gradeCountByArea)),
  )
  $effect(() =>
    syncFeatures(
      sectorLayer,
      buildSectorFeatures(data.sectorBoundingBoxes, data.routeCountBySector, data.gradeCountBySector),
    ),
  )
  $effect(() => syncFeatures(blockLayer, buildBlockFeatures(data.geoBlocks, data.routeCountByBlock)))

  // Re-style the block layer when the selected block changes so the highlight + z-index follow.
  $effect(() => {
    void props.selectedBlockId
    blockLayer?.changed()
  })
  $effect(() => syncFeatures(parkingLayer, buildParkingFeatures(data.uniqueParkingLocations)))
  $effect(() => syncFeatures(pathLayer, buildPathFeatures(data.uniqueLineStrings)))

  // Render the in-progress drawn path (parking → area) as a dashed line, swapped in
  // place like the data layers so it updates on each waypoint without rebuilding the map.
  $effect(() => {
    const mapInstance = map
    const line = props.pathLine
    if (mapInstance == null || line == null || line.length < 1) return

    const layer = createDrawnPathLayer(line)
    mapInstance.addLayer(layer)
    return () => mapInstance.removeLayer(layer)
  })

  // `GeolocationPositionError.code`: 1 = permission denied, 2 = position unavailable, 3 = timeout.
  // Denied is the one worth distinguishing, since no amount of retrying fixes it.
  const locationErrorMessage = (code: number) =>
    code === 1 ? m.map_locationBlocked() : code === 3 ? m.map_locationTimeout() : m.map_locationUnavailable()

  // Plain, not reactive: gates the toast to attempts the user asked for, so a
  // device that silently can't get a fix doesn't toast on every map load.
  let didRequestLocation = false

  const handleGeolocate = () => {
    if (map == null) return
    const geolocation = map.get('geolocation') as OlGeolocation | undefined
    if (geolocation == null) return
    didRequestLocation = true
    isTrackingGeolocation = true
    geolocation.setTracking(true)
    // Recenter from the fix we already hold. A drag only turns the view-follow off, tracking
    // stays on, so `setTracking(true)` is a no-op here and no `change` event fires. Without
    // this, a stationary user's map stays where they dragged it while the button reads active.
    const position = geolocation.getPosition()
    if (position != null) map.getView().animate({ center: position, duration: 200 })
  }

  const handleZoomIn = () => {
    if (map == null) return
    const view = map.getView()
    const zoom = view.getZoom()
    if (zoom != null) view.animate({ duration: 200, zoom: zoom + 1 })
  }

  const handleZoomOut = () => {
    if (map == null) return
    const view = map.getView()
    const zoom = view.getZoom()
    if (zoom != null) view.animate({ duration: 200, zoom: zoom - 1 })
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
    if (name === m.map_markers()) {
      markersVisible = newVisible
    }
    layerEntries = layerEntries.map((entry) => (entry.name === name ? { ...entry, visible: newVisible } : entry))
  }

  // The fill alone is near-white in light mode and vanishes over a pale tile.
  const CONTROL_CLASS = 'btn-icon preset-outlined-surface-300-700'

  // Credits from settings, not off the OL sources, so the list is complete before the first tile
  // lands. Every layer the regions define, not only the drawn ones: over-crediting is the safe
  // direction for a licence. Parsed, never `{@html}`: these are region-admin input.
  const creditStrings = $derived(
    global.userRegions
      .flatMap((region) => region.settings.mapLayers.flatMap((layer) => layer.attributions ?? []))
      .filter((credit, index, all) => all.indexOf(credit) === index),
  )

  // Parsed only while the sheet is open: each credit costs a whole DOM document, and a desktop
  // panel renders its body even closed.
  const regionCredits = $derived(
    !browser || !isAttributionOpen ? [] : creditStrings.map((credit) => ({ credit, parts: parseCredit(credit) })),
  )

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
    // Everything here is read untracked so the attachment has NO reactive dependencies and
    // runs exactly once. Reading a reactive prop (e.g. `props.static`) tracked would re-run
    // this whole attachment whenever that prop changes, rebuilding the entire OL map and
    // flashing it. WMS layers and `static` are fixed for a map instance, so reading them once
    // is correct; live map data flows through the per-layer sync effects, not here.
    const wmsLayers = untrack(() => createWmsLayers(global.userRegions))
    const isStatic = untrack(() => props.static)

    const base = createBaseMap(node as HTMLElement, {
      extraLayers: wmsLayers,
      interactive: !isStatic,
      // Seeded so a rebuilt map does not snap back to the world view.
      view: savedView,
    })
    const mapInstance = base.map
    map = mapInstance
    baseMap = base

    mapInstance.on('click', (event) => {
      if (props.drawPath) {
        const [lng, lat] = toLonLat(event.coordinate)
        props.onpathpoint?.([lat, lng])
        return
      }
      if (props.pickMode) return
      const feature = mapInstance.forEachFeatureAtPixel(event.pixel, (f) => f)
      if (feature) {
        const blockId = feature.get('blockId')
        const areaId = feature.get('areaId')
        const parkingId = feature.get('parkingId')
        if (parkingId != null) {
          props.onfeatureopen?.()
          goto(resolve('/(app)/(shell)/(explore)/(map)/parking/[id]', { id: parkingId.toString() }))
        } else if (blockId != null) {
          props.onfeatureopen?.()
          goto(resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: blockId.toString() }))
        } else if (areaId != null) {
          props.onfeatureopen?.()
          goto(resolve('/(app)/(shell)/(explore)/(map)/areas/[id]', { id: areaId.toString() }))
        }
      }
    })

    mapInstance.on('pointermove', (event) => {
      if (props.pickMode) return
      const target = mapInstance.getTarget()
      if (target == null || typeof target === 'string') return
      const hit = mapInstance.hasFeatureAtPixel(event.pixel, {
        layerFilter: (layer) => layer.get('clickable') === true,
      })
      target.style.cursor = hit ? 'pointer' : ''
    })

    const handleMoveEnd = () => {
      const view = mapInstance.getView()
      const center = view.getCenter()
      if (center == null) return

      const [lng, lat] = toLonLat(center)
      const zoom = view.getZoom() ?? BLOCK_LABEL_ZOOM
      savedView = { center, zoom }
      props.onviewchange?.({ center: [lat, lng], zoom })
    }
    mapInstance.on('moveend', handleMoveEnd)

    let lastLabelState = false
    mapInstance.getView().on('change:resolution', () => {
      const zoom = mapInstance.getView().getZoom() ?? 0
      const showLabels = zoom >= BLOCK_LABEL_ZOOM
      if (showLabels !== lastLabelState) {
        lastLabelState = showLabels
        mapInstance
          .getLayers()
          .getArray()
          .find((layer) => layer.get('isBlockLayer'))
          ?.changed()
      }
    })

    // Long-press / right-click → onlongpress with the pressed coordinate. `contextmenu`
    // covers mouse right-click and Android's native long-press; iOS Safari never fires it
    // on touch, so a manual pointer timer covers it. Both can fire for one gesture on
    // Android: `lastLongPress` dedupes. Movement past a small slop reads as a pan and
    // cancels, so hesitant drags don't trigger it.
    const viewport = mapInstance.getViewport()
    let pressTimer: ReturnType<typeof setTimeout> | undefined
    let pressStart: [number, number] | null = null
    let lastLongPress = 0

    const fireLongPress = (clientX: number, clientY: number) => {
      const now = Date.now()
      if (now - lastLongPress < 700) return
      lastLongPress = now
      const rect = viewport.getBoundingClientRect()
      const [lng, lat] = toLonLat(mapInstance.getCoordinateFromPixel([clientX - rect.left, clientY - rect.top]))
      props.onlongpress?.([lat, lng])
    }

    const cancelPress = () => {
      clearTimeout(pressTimer)
      pressStart = null
    }

    const onContextMenu = (event: MouseEvent) => {
      if (props.onlongpress == null) return
      event.preventDefault()
      cancelPress()
      fireLongPress(event.clientX, event.clientY)
    }

    const onPointerDown = (event: PointerEvent) => {
      // A second finger (pinch) cancels; mouse users go through contextmenu instead.
      if (props.onlongpress == null || event.pointerType === 'mouse' || !event.isPrimary) {
        cancelPress()
        return
      }
      pressStart = [event.clientX, event.clientY]
      clearTimeout(pressTimer)
      pressTimer = setTimeout(() => {
        if (pressStart != null) fireLongPress(pressStart[0], pressStart[1])
        pressStart = null
      }, 500)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (pressStart == null) return
      if (Math.hypot(event.clientX - pressStart[0], event.clientY - pressStart[1]) > 10) cancelPress()
    }

    viewport.addEventListener('contextmenu', onContextMenu)
    viewport.addEventListener('pointerdown', onPointerDown)
    viewport.addEventListener('pointermove', onPointerMove)
    viewport.addEventListener('pointerup', cancelPress)
    viewport.addEventListener('pointercancel', cancelPress)

    const cleanupGeolocation = setupGeolocation(mapInstance, {
      getHasFocus: () => props.focus != null,
      getIsTracking: () => isTrackingGeolocation,
      setError: (code) => {
        geolocationErrorCode = code
        const wasRequested = didRequestLocation
        didRequestLocation = false
        if (code != null && wasRequested) {
          toaster.create({ duration: 8000, title: locationErrorMessage(code), type: 'error' })
        }
      },
      setIsTracking: (v) => (isTrackingGeolocation = v),
    })

    return () => {
      mapInstance.un('moveend', handleMoveEnd)
      viewport.removeEventListener('contextmenu', onContextMenu)
      viewport.removeEventListener('pointerdown', onPointerDown)
      viewport.removeEventListener('pointermove', onPointerMove)
      viewport.removeEventListener('pointerup', cancelPress)
      viewport.removeEventListener('pointercancel', cancelPress)
      cancelPress()
      cleanupGeolocation()
      base.destroy()
      map = undefined
      baseMap = undefined
    }
  }
</script>

<div class="relative z-10 h-full">
  <div class="map h-full" {@attach mapAttachment}></div>

  <!-- The credit is not a control and is not optional: OSM's licence wants it wherever its
       tiles are drawn, static previews included. Only the interactive controls are gated. -->
  <div
    class={['absolute right-2 z-20 flex flex-col gap-1', props.static ? 'bottom-1' : 'bottom-20.5 mb-10 md:bottom-2']}
  >
    {#if !props.static}
      <button
        type="button"
        class={[CONTROL_CLASS, 'preset-filled-surface-100-900']}
        onclick={handleZoomIn}
        aria-label={m.map_zoomIn()}
      >
        <Icon name="plus" size={16} />
      </button>

      <button
        type="button"
        class={[CONTROL_CLASS, 'preset-filled-surface-100-900']}
        onclick={handleZoomOut}
        aria-label={m.map_zoomOut()}
      >
        <Icon name="minus" size={16} />
      </button>

      <div class="h-8"></div>

      <button
        type="button"
        aria-label={m.map_showMyLocation()}
        class={[
          CONTROL_CLASS,
          isTrackingGeolocation
            ? 'preset-filled-primary-500'
            : geolocationErrorCode != null
              ? 'preset-filled-error-500'
              : 'preset-filled-surface-100-900',
        ]}
        onclick={handleGeolocate}
        title={geolocationErrorCode == null ? undefined : locationErrorMessage(geolocationErrorCode)}
      >
        <Icon name="locate" size={16} />
      </button>

      <Modal
        bind:open={isLayersSheetOpen}
        popoverProps={{ positioning: { placement: 'left' } }}
        snapPoints={[0.4]}
        title={m.map_layers()}
      >
        {#snippet trigger(props)}
          <button
            type="button"
            {...props}
            aria-label={m.map_toggleLayers()}
            class={[
              props.class,
              CONTROL_CLASS,
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
              type="button"
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
    {/if}

    <Modal
      bind:open={isAttributionOpen}
      popoverProps={{ positioning: { placement: 'left' } }}
      snapPoints={[0.4]}
      title={m.map_attribution()}
    >
      {#snippet trigger(triggerProps)}
        {#if props.static}
          <!-- A preview has no control column to sit in, so the credit shows itself rather than
               hiding behind an icon, the way StaticMap's does. Pressing it opens the full list. -->
          <button
            type="button"
            {...triggerProps}
            aria-label={m.map_showAttribution()}
            class={[
              triggerProps.class,
              'text-surface-950-50 bg-surface-50-950/70 rounded px-1 text-[10px] leading-tight',
            ]}
            onclick={() => (isAttributionOpen = !isAttributionOpen)}
          >
            &copy; OpenStreetMap
          </button>
        {:else}
          <button
            type="button"
            {...triggerProps}
            aria-label={m.map_showAttribution()}
            class={[
              triggerProps.class,
              CONTROL_CLASS,
              isAttributionOpen ? 'preset-filled-primary-500' : 'preset-filled-surface-100-900',
            ]}
            onclick={() => (isAttributionOpen = !isAttributionOpen)}
          >
            <Icon name="info" size={16} />
          </button>
        {/if}
      {/snippet}

      <!-- OSM's credit is required by the ODbL, so it renders whether or not a region adds
           layers of its own. Region credits carry their own links, which is the whole point of
           them: `parseCredit` re-emits the stored markup as text and anchors, never as HTML. -->
      <ul class="space-y-2 text-sm">
        <li class="text-surface-700-300">
          &copy;
          <a
            class="text-primary-500 hover:underline"
            href="https://www.openstreetmap.org/copyright"
            rel="noreferrer"
            target="_blank"
          >
            OpenStreetMap
          </a>
          contributors
        </li>

        {#each regionCredits as { credit, parts } (credit)}
          <li class="text-surface-700-300">
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
          </li>
        {/each}
      </ul>
    </Modal>
  </div>
</div>

<style>
  /* No text to select on the map: suppressing selection also keeps iOS from showing
     its callout/loupe on long-press (which the quick-create gesture relies on). */
  .map {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  :global(.geolocation-marker) {
    position: relative;
    width: 16px;
    height: 16px;
    background-color: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
  }

  /* Heading cone, hidden until the device reports a direction while moving. */
  :global(.geolocation-marker__heading) {
    position: absolute;
    inset: -22px;
    display: none;
    rotate: var(--heading, 0rad);
    transition: rotate 200ms linear;
    background: conic-gradient(from -30deg, rgba(59, 130, 246, 0.65), transparent 60deg);
    /* Ring out from the dot, fading before the square edge so the fan stays a fan. */
    mask-image: radial-gradient(circle at 50% 50%, transparent 10px, black 12px, black 18px, transparent 27px);
  }

  :global(.geolocation-marker--moving .geolocation-marker__heading) {
    display: block;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.geolocation-marker__heading) {
      transition: none;
    }
  }
</style>
