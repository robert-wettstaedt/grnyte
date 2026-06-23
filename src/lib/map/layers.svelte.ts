import type { BlockDetail } from '$lib/entities/block/dto'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import { buildGradeDonutSvg } from '$lib/entities/grade/donut'
import type { UserRegion } from '$lib/entities/region/dto'
import Feature, { type FeatureLike } from 'ol/Feature.js'
import type OlMap from 'ol/Map.js'
import Polyline from 'ol/format/Polyline'
import { LineString, Polygon } from 'ol/geom'
import Point from 'ol/geom/Point.js'
import { fromExtent } from 'ol/geom/Polygon'
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer.js'
import { fromLonLat } from 'ol/proj.js'
import { Vector as VectorSource } from 'ol/source.js'
import TileWMS from 'ol/source/TileWMS.js'
import { Fill, Stroke, Style, Text } from 'ol/style.js'
import CircleStyle from 'ol/style/Circle'
import Icon from 'ol/style/Icon'
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
import { BLOCK_LABEL_ZOOM, BLOCK_ZOOM, CRAG_ZOOM } from './types'

// Read-only fallback for areas/crags with no grade data, so we never allocate per feature.
const EMPTY_GRADE_COUNTS: Map<number, number> = new SvelteMap<number, number>()

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
        text: name,
        font: 'bold 13px sans-serif',
        fill: new Fill({ color: '#1f2937' }),
        stroke: new Stroke({ color: 'white', width: 3 }),
        offsetY: donutSize / 2 + 12,
        overflow: true,
      }),
    }),
  ]
}

export function createWmsLayers(userRegions: UserRegion[]): TileLayer[] {
  return userRegions.flatMap((region) =>
    (region.settings?.mapLayers ?? []).map(
      (regionLayer) =>
        new TileLayer({
          properties: { layerName: regionLayer.name },
          source: new TileWMS({
            attributions: regionLayer.attributions ?? [],
            url: regionLayer.url,
            params: regionLayer.params ?? {},
          }),
          minZoom: regionLayer.minZoom ?? undefined,
          opacity: regionLayer.opacity ?? undefined,
        }),
    ),
  )
}

// The outermost area grouping, drawn when zoomed out so the far view isn't cluttered with
// every crag; from CRAG_ZOOM the crag rects take over.
export function createAreaLayer(
  areaBoundingBoxes: Map<number, { area: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>,
  _blocksByArea: Map<number, { area: BlockDetail['areas'][0]; blocks: BlockDetail[] }>,
  routeCountByArea: Map<number, number>,
  gradeCountByArea: Map<number, Map<number, number>>,
): VectorLayer {
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
        stroke: new Stroke({ color: '#1f2937', width: 1 }),
        fill: new Fill({ color: 'rgba(248, 250, 252, 0.15)' }),
      }),
      ...createDonutMarkerStyles(area.name, routeCount, gradeCounts, 36),
    ])
    features.push(feature)
  }

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    maxZoom: CRAG_ZOOM,
  })
  layer.set('layerName', 'Markers')
  return layer
}

// A crag is the block-holding area: a rect around its blocks, shown at mid zoom until the
// user zooms in far enough for the individual block markers to take over.
export function createCragLayer(
  cragBoundingBoxes: Map<number, { crag: BlockDetail['areas'][0]; bounds: [number, number, number, number] }>,
  _blocksByCrag: Map<number, { crag: BlockDetail['areas'][0]; blocks: BlockDetail[] }>,
  routeCountByCrag: Map<number, number>,
  gradeCountByCrag: Map<number, Map<number, number>>,
): VectorLayer {
  const features: Feature[] = []

  for (const [cragId, { crag, bounds }] of cragBoundingBoxes) {
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
        stroke: new Stroke({ color: '#313944', width: 1 }),
        fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
      }),
      ...createDonutMarkerStyles(crag.name, routeCount, gradeCounts, 32),
    ])
    features.push(feature)
  }

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    minZoom: CRAG_ZOOM,
    maxZoom: BLOCK_ZOOM,
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createBlockLayer(
  geoBlocks: BlockDetail[],
  mapInstance: OlMap,
  routeCountByBlock: Map<number, number>,
): VectorLayer {
  const features: Feature[] = []

  for (const block of geoBlocks) {
    const geo = block.geolocation!
    const feature = new Feature({
      geometry: new Point(fromLonLat([geo.long, geo.lat])),
      name: block.name,
      blockId: block.id,
      routeCount: routeCountByBlock.get(block.id) ?? 0,
    })
    features.push(feature)
  }

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    minZoom: BLOCK_ZOOM,
    style: (feature) => {
      const zoom = mapInstance.getView().getZoom() ?? 0
      const showLabel = zoom >= BLOCK_LABEL_ZOOM
      const routeCount = feature.get('routeCount') as number
      const styles: Style[] = []

      if (routeCount > 0) {
        styles.push(
          new Style({
            image: new CircleStyle({
              radius: 12,
              fill: new Fill({ color: '#ef4444' }),
              stroke: new Stroke({ color: 'white', width: 1.5 }),
            }),
            text: new Text({
              text: String(routeCount),
              font: 'bold 10px sans-serif',
              fill: new Fill({ color: 'white' }),
            }),
          }),
        )
      } else {
        styles.push(
          new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color: '#ef4444' }),
            }),
          }),
        )
      }

      if (showLabel) {
        styles.push(
          new Style({
            text: new Text({
              text: feature.get('name') as string,
              font: '12px sans-serif',
              fill: new Fill({ color: '#000' }),
              backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
              padding: [2, 4, 2, 4],
              offsetY: 18,
              overflow: true,
            }),
          }),
        )
      }

      return styles
    },
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createParkingLayer(uniqueParkingLocations: Geolocation[]): VectorLayer {
  const features: Feature[] = uniqueParkingLocations.map(
    (p) =>
      new Feature({
        geometry: new Point(fromLonLat([p.long, p.lat])),
        parkingId: p.id,
      }),
  )

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    minZoom: BLOCK_ZOOM,
    // Add a subtle circular hit area so transparent parts of the icon remain clickable.
    style: [
      new Style({
        image: new CircleStyle({
          radius: 14,
          fill: new Fill({ color: 'rgba(30, 64, 175, 0.01)' }),
        }),
      }),
      new Style({
        text: new Text({
          font: '900 1.75rem "Font Awesome 7 Free"',
          text: '',
          fill: new Fill({ color: '#1e40af' }),
        }),
      }),
    ],
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createPathLayer(uniqueLineStrings: string[]): VectorLayer {
  const features: Feature[] = []
  const distinctPaths = [...new SvelteSet(uniqueLineStrings)]

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

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    minZoom: BLOCK_ZOOM,
    style: new Style({
      stroke: new Stroke({ color: 'rgba(30, 64, 175, 0.7)', width: 2 }),
    }),
  })
  layer.set('layerName', 'Markers')
  return layer
}

// OpenLayers' colour parser doesn't understand `oklch`, so resolve the theme's
// primary to an `rgb(...)` string once (the browser serialises it that way).
let cachedPrimaryColor: string | undefined
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

/** A path being drawn (parking → area), from `[lat, lng]` points: a marker at the
 *  start (the parking) plus a dashed primary line once there's a waypoint. */
export function createDrawnPathLayer(latLngs: [number, number][]): VectorLayer {
  const coords = latLngs.map(([lat, lng]) => fromLonLat([lng, lat]))

  const features: Feature[] = [new Feature(new Point(coords[0]))]
  if (coords.length >= 2) {
    features.push(new Feature(new LineString(coords)))
  }

  const strokeStyle = new Style({
    stroke: new Stroke({ color: primaryColor(), width: 4, lineDash: [2, 9], lineCap: 'round', lineJoin: 'round' }),
  })
  const markerStyle = new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: primaryColor() }),
      stroke: new Stroke({ color: 'white', width: 2.5 }),
    }),
  })

  return new VectorLayer({
    source: new VectorSource({ features }),
    style: (feature) => (feature.getGeometry() instanceof Point ? markerStyle : strokeStyle),
  })
}
