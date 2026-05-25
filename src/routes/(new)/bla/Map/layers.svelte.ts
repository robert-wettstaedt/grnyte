import type { Geolocation } from '$lib/db/schema'
import { getBlockName } from '$lib/helper.svelte'
import Feature from 'ol/Feature.js'
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
import { BLOCK_LABEL_ZOOM, BLOCK_ZOOM, SECTOR_ZOOM, type NestedBlock } from './types'

export function createWmsLayers(userRegions: App.UserRegion[]): TileLayer[] {
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

export function createCragLayer(
  cragBoundingBoxes: Map<number, { crag: NestedBlock['area']; bounds: [number, number, number, number] }>,
  _blocksByCrag: Map<number, { crag: NestedBlock['area']; blocks: NestedBlock[] }>,
  routeCountByCrag: Map<number, number>,
): VectorLayer {
  const features: Feature[] = []

  for (const [cragId, { crag, bounds }] of cragBoundingBoxes) {
    const [minLat, minLng, maxLat, maxLng] = bounds
    const routeCount = routeCountByCrag.get(cragId) ?? 0
    const extent = [...fromLonLat([minLng, minLat]), ...fromLonLat([maxLng, maxLat])]
    const geometry = fromExtent(extent)

    const feature = new Feature({ geometry, name: `${crag.name}` })
    feature.set('routeCount', routeCount)
    feature.set('areaId', cragId)
    features.push(feature)
  }

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    maxZoom: SECTOR_ZOOM,
    style: (feature) => {
      const name = feature.get('name') as string
      const count = feature.get('routeCount') as number
      return [
        new Style({
          stroke: new Stroke({ color: '#1f2937', width: 1 }),
          fill: new Fill({ color: 'rgba(248, 250, 252, 0.15)' }),
        }),
        new Style({
          geometry: (feature) => {
            const geom = feature.getGeometry() as Polygon
            return geom.getInteriorPoint()
          },
          image: new CircleStyle({
            radius: 16,
            fill: new Fill({ color: '#ef4444' }),
            stroke: new Stroke({ color: 'white', width: 2 }),
          }),
          text: new Text({
            text: String(count),
            font: 'bold 12px sans-serif',
            fill: new Fill({ color: 'white' }),
          }),
        }),
        new Style({
          geometry: (feature) => {
            const geom = feature.getGeometry() as Polygon
            return geom.getInteriorPoint()
          },
          text: new Text({
            text: name,
            font: 'bold 13px sans-serif',
            fill: new Fill({ color: '#1f2937' }),
            stroke: new Stroke({ color: 'white', width: 3 }),
            offsetY: 24,
            overflow: true,
          }),
        }),
      ]
    },
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createSectorLayer(
  sectorBoundingBoxes: Map<number, { sector: NestedBlock['area']; bounds: [number, number, number, number] }>,
  _blocksBySector: Map<number, { sector: NestedBlock['area']; blocks: NestedBlock[] }>,
  routeCountBySector: Map<number, number>,
): VectorLayer {
  const features: Feature[] = []

  for (const [sectorId, { sector, bounds }] of sectorBoundingBoxes) {
    const [minLat, minLng, maxLat, maxLng] = bounds
    const routeCount = routeCountBySector.get(sectorId) ?? 0
    const extent = [...fromLonLat([minLng, minLat]), ...fromLonLat([maxLng, maxLat])]
    const geometry = fromExtent(extent)

    const feature = new Feature({ geometry, name: `${sector.name}` })
    feature.set('routeCount', routeCount)
    feature.set('areaId', sectorId)
    features.push(feature)
  }

  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    minZoom: SECTOR_ZOOM,
    maxZoom: BLOCK_ZOOM,
    style: (feature) => {
      const name = feature.get('name') as string
      const count = feature.get('routeCount') as number
      return [
        new Style({
          stroke: new Stroke({ color: '#313944', width: 1 }),
          fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
        }),
        new Style({
          geometry: (feature) => {
            const geom = feature.getGeometry() as Polygon
            return geom.getInteriorPoint()
          },
          image: new CircleStyle({
            radius: 16,
            fill: new Fill({ color: '#ef4444' }),
            stroke: new Stroke({ color: 'white', width: 2 }),
          }),
          text: new Text({
            text: String(count),
            font: 'bold 12px sans-serif',
            fill: new Fill({ color: 'white' }),
          }),
        }),
        new Style({
          geometry: (feature) => {
            const geom = feature.getGeometry() as Polygon
            return geom.getInteriorPoint()
          },
          text: new Text({
            text: name,
            font: 'bold 13px sans-serif',
            fill: new Fill({ color: '#1f2937' }),
            stroke: new Stroke({ color: 'white', width: 3 }),
            offsetY: 24,
            overflow: true,
          }),
        }),
      ]
    },
  })
  layer.set('layerName', 'Markers')
  return layer
}

export function createBlockLayer(
  geoBlocks: NestedBlock[],
  mapInstance: OlMap,
  routeCountByBlock: Map<number, number>,
): VectorLayer {
  const features: Feature[] = []

  for (const block of geoBlocks) {
    const geo = block.geolocation!
    const feature = new Feature({
      geometry: new Point(fromLonLat([geo.long, geo.lat])),
      name: getBlockName(block),
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
          text: '\uf540',
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
