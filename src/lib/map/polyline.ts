import Polyline from 'ol/format/Polyline'
import { LineString } from 'ol/geom'
import { fromLonLat } from 'ol/proj.js'

/**
 * Encode a `[lat, lng]` path as a Google-polyline string — the exact inverse of how
 * `createPathLayer` decodes `areas.geoPaths`, so a saved path round-trips and renders
 * back where it was drawn. Kept out of `map.ts` so `ol/*` doesn't leak into the
 * non-map code that imports the lightweight helpers there.
 */
export function encodePath(latLngs: [number, number][]): string {
  const coords = latLngs.map(([lat, lng]) => fromLonLat([lng, lat]))
  return new Polyline({ geometryLayout: 'XY' }).writeGeometry(new LineString(coords), {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  })
}

/** Inverse of {@link encodePath}: an encoded polyline back to its `[lat, lng]` points. */
export function decodePath(encoded: string): [number, number][] {
  const geometry = new Polyline({ geometryLayout: 'XY' }).readGeometry(encoded, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:4326',
  }) as LineString
  return geometry.getCoordinates().map(([lng, lat]) => [lat, lng])
}
