import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import { buildGradeDonutSvg } from '$lib/entities/grade/donut'
import type { UserRegion } from '$lib/entities/region/dto'
import Feature, { type FeatureLike } from 'ol/Feature.js'
import Polyline from 'ol/format/Polyline'
import { LineString, Polygon } from 'ol/geom'
import Point from 'ol/geom/Point.js'
import { fromExtent } from 'ol/geom/Polygon'
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js'
import type OlMap from 'ol/Map.js'
import { fromLonLat } from 'ol/proj.js'
import { Vector as VectorSource } from 'ol/source.js'
import TileWMS from 'ol/source/TileWMS.js'
import { Fill, Stroke, Style, Text } from 'ol/style.js'
import CircleStyle from 'ol/style/Circle'
import Icon from 'ol/style/Icon'
// APPROACH_COLOR is defined in `./tiles` and imported back, never the other way round. A constant
// this module shares with a non-OpenLayers renderer must not live here: `ol` lists `proj.js` under
// `sideEffects` in its package.json, so no bundler may drop it, and importing one string from this
// module would pull the whole library into StaticMap and so into every feed card.
import { APPROACH_COLOR } from './tiles'
import { BLOCK_LABEL_ZOOM, BLOCK_ZOOM, CRAG_ZOOM } from './types'

// Read-only fallback for areas/crags with no grade data, so we never allocate per feature.
const EMPTY_GRADE_COUNTS: Map<number, number> = new Map<number, number>()

// The data layers are created once (empty) and kept stable; only their features are
// rebuilt when the corresponding data changes (see Map.svelte). Recreating a layer
// reloads its styles — including the expensive donut data-URI icons below — which
// flashes the map, so we never do that on a data update.

// The outermost area grouping, drawn when zoomed out so the far view isn't cluttered with
// every crag; from CRAG_ZOOM the crag rects take over.
export function buildAreaFeatures(
  areaBoundingBoxes: Map<number, { area: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>,
  routeCountByArea: Map<number, number>,
  gradeCountByArea: Map<number, Map<number, number>>,
): Feature[] {
  const features: Feature[] = []

  for (const [areaId, { area, bounds }] of areaBoundingBoxes) {
    const [minLat, minLng, maxLat, maxLng] = bounds
    const routeCount = routeCountByArea.get(areaId) ?? 0
    const gradeCounts = gradeCountByArea.get(areaId) ?? EMPTY_GRADE_COUNTS
    const extent = [...fromLonLat([minLng, minLat]), ...fromLonLat([maxLng, maxLat])]
    const geometry = fromExtent(extent)

    const feature = new Feature({ geometry, name: `${area.name}` })
    feature.set('routeCount', routeCount)
    feature.set('areaId', areaId)
    feature.setStyle([
      new Style({
        fill: new Fill({ color: 'rgba(248, 250, 252, 0.15)' }),
        stroke: new Stroke({ color: '#1f2937', width: 1 }),
      }),
      ...createDonutMarkerStyles(area.name, routeCount, gradeCounts, 36),
    ])
    features.push(feature)
  }

  return features
}

export function buildBlockFeatures(geoBlocks: BlockDetail[], routeCountByBlock: Map<number, number>): Feature[] {
  const features: Feature[] = []

  for (const block of geoBlocks) {
    const geo = block.geolocation!
    const feature = new Feature({
      blockId: block.id,
      estimated: geo.estimated,
      geometry: new Point(fromLonLat([geo.long, geo.lat])),
      name: block.name,
      routeCount: routeCountByBlock.get(block.id) ?? 0,
    })
    features.push(feature)
  }

  return features
}

// A crag is the block-holding area: a rect around its blocks, shown at mid zoom until the
// user zooms in far enough for the individual block markers to take over.
export function buildCragFeatures(
  cragBoundingBoxes: Map<number, { bounds: [number, number, number, number]; crag: BlockDetail['areas'][0] }>,
  routeCountByCrag: Map<number, number>,
  gradeCountByCrag: Map<number, Map<number, number>>,
): Feature[] {
  const features: Feature[] = []

  for (const [cragId, { bounds, crag }] of cragBoundingBoxes) {
    const [minLat, minLng, maxLat, maxLng] = bounds
    const routeCount = routeCountByCrag.get(cragId) ?? 0
    const gradeCounts = gradeCountByCrag.get(cragId) ?? EMPTY_GRADE_COUNTS
    const extent = [...fromLonLat([minLng, minLat]), ...fromLonLat([maxLng, maxLat])]
    const geometry = fromExtent(extent)

    const feature = new Feature({ geometry, name: `${crag.name}` })
    feature.set('routeCount', routeCount)
    feature.set('areaId', cragId)
    feature.setStyle([
      new Style({
        fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
        stroke: new Stroke({ color: '#313944', width: 1 }),
      }),
      ...createDonutMarkerStyles(crag.name, routeCount, gradeCounts, 32),
    ])
    features.push(feature)
  }

  return features
}

// `id` is optional so the reorder map can pass a bare reference point (no navigation),
// while the main map passes full `Geolocation`s whose `parkingId` drives click-to-open.
export function buildParkingFeatures(
  uniqueParkingLocations: (Pick<Geolocation, 'lat' | 'long'> & { id?: number })[],
): Feature[] {
  return uniqueParkingLocations.map(
    (p) =>
      new Feature({
        geometry: new Point(fromLonLat([p.long, p.lat])),
        parkingId: p.id,
      }),
  )
}

export function buildPathFeatures(uniqueLineStrings: string[]): Feature[] {
  const features: Feature[] = []
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe, not reactive state
  const distinctPaths = [...new Set(uniqueLineStrings)]

  for (const encoded of distinctPaths) {
    try {
      const geometry = new Polyline({ geometryLayout: 'XY' }).readGeometry(encoded, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as LineString
      features.push(new Feature({ geometry }))
    } catch {
      // skip malformed polylines
    }
  }

  return features
}

export function createAreaLayer(): VectorLayer {
  const layer = new VectorLayer({ maxZoom: CRAG_ZOOM, source: new VectorSource() })
  layer.set('layerName', 'Markers')
  return layer
}

export function createBlockLayer(mapInstance: OlMap, getSelectedId: () => number | undefined): VectorLayer {
  const layer = new VectorLayer({
    minZoom: BLOCK_ZOOM,
    source: new VectorSource(),
    style: (feature) => {
      const zoom = mapInstance.getView().getZoom() ?? 0
      const showLabel = zoom >= BLOCK_LABEL_ZOOM
      const routeCount = feature.get('routeCount') as number
      // An estimated pin shows "?" instead of the route count: the block is somewhere
      // around here, expect to search for it.
      const estimated = feature.get('estimated') as boolean
      const selected = feature.get('blockId') === getSelectedId()
      // Lift the selected block's styles above every other feature in the layer.
      const zIndex = selected ? 1000 : undefined
      const fill = new Fill({ color: selected ? primaryColor() : '#ef4444' })
      const styles: Style[] = []

      if (routeCount > 0 || estimated) {
        styles.push(
          new Style({
            image: new CircleStyle({
              fill,
              radius: selected ? 14 : 12,
              stroke: new Stroke({ color: 'white', width: selected ? 2.5 : 1.5 }),
            }),
            text: new Text({
              fill: new Fill({ color: 'white' }),
              font: 'bold 10px sans-serif',
              text: estimated ? '?' : String(routeCount),
            }),
            zIndex,
          }),
        )
      } else {
        styles.push(
          new Style({
            image: new CircleStyle({
              fill,
              radius: selected ? 8 : 5,
              stroke: selected ? new Stroke({ color: 'white', width: 2 }) : undefined,
            }),
            zIndex,
          }),
        )
      }

      if (showLabel) {
        styles.push(
          new Style({
            text: new Text({
              backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
              fill: new Fill({ color: '#000' }),
              font: '12px sans-serif',
              offsetY: 18,
              overflow: true,
              padding: [2, 4, 2, 4],
              text: feature.get('name') as string,
            }),
            zIndex,
          }),
        )
      }

      return styles
    },
    // Above the parking (zIndex 1) and path (0): the blocks are the content, so they win overlaps.
    zIndex: 2,
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createCragLayer(): VectorLayer {
  const layer = new VectorLayer({ maxZoom: BLOCK_ZOOM, minZoom: CRAG_ZOOM, source: new VectorSource() })
  layer.set('layerName', 'Markers')
  return layer
}

// `minZoom` defaults to BLOCK_ZOOM (the main map's zoom tiers); the reorder map passes 0 so the
// parking always shows on its single-area view.
export function createParkingLayer(minZoom = BLOCK_ZOOM): VectorLayer {
  const layer = new VectorLayer({
    minZoom,
    source: new VectorSource(),
    // Add a subtle circular hit area so transparent parts of the icon remain clickable.
    style: [
      new Style({
        image: new CircleStyle({
          fill: new Fill({ color: 'rgba(30, 64, 175, 0.01)' }),
          radius: 14,
        }),
      }),
      new Style({
        image: new Icon({ src: 'data:image/svg+xml;utf8,' + encodeURIComponent(parkingMarkerSvg(28)) }),
      }),
    ],
    // Above the path layer (default zIndex 0) so the approach line never crosses over the marker.
    zIndex: 1,
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createPathLayer(minZoom = BLOCK_ZOOM): VectorLayer {
  const layer = new VectorLayer({
    minZoom,
    source: new VectorSource(),
    style: new Style({
      stroke: new Stroke({ color: APPROACH_COLOR, width: 2 }),
    }),
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createWmsLayers(userRegions: UserRegion[]): TileLayer[] {
  return userRegions.flatMap((region) =>
    (region.settings?.mapLayers ?? []).map(
      (regionLayer) =>
        new TileLayer({
          minZoom: regionLayer.minZoom ?? undefined,
          opacity: regionLayer.opacity ?? undefined,
          properties: { layerName: regionLayer.name },
          source: new TileWMS({
            attributions: regionLayer.attributions ?? [],
            params: regionLayer.params ?? {},
            url: regionLayer.url,
          }),
        }),
    ),
  )
}

// Marker showing the area/crag's grade histogram as a small donut with the route
// count in the center. Built once per feature (the data-URI icon is expensive to
// regenerate) and anchored at the polygon's interior point.
function createDonutMarkerStyles(
  name: string,
  count: number,
  gradeCounts: Map<number, number>,
  donutSize: number,
): Style[] {
  const interiorPoint = (feature: FeatureLike) => (feature.getGeometry() as Polygon).getInteriorPoint()
  const svg = buildGradeDonutSvg(gradeCounts, count, donutSize)

  return [
    new Style({
      geometry: interiorPoint,
      image: new Icon({ src: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg) }),
    }),
    new Style({
      geometry: interiorPoint,
      text: new Text({
        fill: new Fill({ color: '#1f2937' }),
        font: 'bold 13px sans-serif',
        offsetY: donutSize / 2 + 12,
        overflow: true,
        stroke: new Stroke({ color: 'white', width: 3 }),
        text: name,
      }),
    }),
  ]
}

/** Parking marker: a filled blue square-parking badge (lucide geometry). Built from an inline
 *  SVG, not a webfont \u2014 the app dropped Font Awesome. */
function parkingMarkerSvg(size = 28): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><rect x="1" y="1" width="22" height="22" rx="5" fill="#1e40af" stroke="white" stroke-width="1.5"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

// OpenLayers' colour parser doesn't understand `oklch`, so resolve the theme's
// primary to an `rgb(...)` string once (the browser serialises it that way).
let cachedPrimaryColor: string | undefined
/** A path being drawn (parking → area), from `[lat, lng]` points: a marker at the
 *  start (the parking) plus a dashed primary line once there's a waypoint. */
export function createDrawnPathLayer(latLngs: [number, number][]): VectorLayer {
  const coords = latLngs.map(([lat, lng]) => fromLonLat([lng, lat]))

  const features: Feature[] = [new Feature(new Point(coords[0]))]
  if (coords.length >= 2) {
    features.push(new Feature(new LineString(coords)))
  }

  const strokeStyle = new Style({
    stroke: new Stroke({ color: primaryColor(), lineCap: 'round', lineDash: [2, 9], lineJoin: 'round', width: 4 }),
  })
  const markerStyle = new Style({
    image: new CircleStyle({
      fill: new Fill({ color: primaryColor() }),
      radius: 7,
      stroke: new Stroke({ color: 'white', width: 2.5 }),
    }),
  })

  return new VectorLayer({
    source: new VectorSource({ features }),
    style: (feature) => (feature.getGeometry() instanceof Point ? markerStyle : strokeStyle),
  })
}

function primaryColor(): string {
  if (cachedPrimaryColor != null) return cachedPrimaryColor
  if (typeof document === 'undefined') return '#7c3aed'
  const probe = document.createElement('span')
  probe.style.color = 'var(--color-primary-500)'
  document.body.appendChild(probe)
  cachedPrimaryColor = getComputedStyle(probe).color || '#7c3aed'
  probe.remove()
  return cachedPrimaryColor
}
