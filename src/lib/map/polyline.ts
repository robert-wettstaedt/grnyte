import Polyline from 'ol/format/Polyline'
import { LineString } from 'ol/geom'
import { fromLonLat } from 'ol/proj.js'
import type { Coords } from './map'

/** Inverse of {@link encodePath}: an encoded polyline back to its `[lat, lng]` points. */
export function decodePath(encoded: string): [number, number][] {
  const geometry = new Polyline({ geometryLayout: 'XY' }).readGeometry(encoded, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:4326',
  }) as LineString
  return geometry.getCoordinates().map(([lng, lat]) => [lat, lng])
}

/**
 * Encode a `[lat, lng]` path as a Google-polyline string: the exact inverse of how
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

const approachCache = new Map<string, Coords[][]>()

/**
 * One stored approach path as coordinates, or nothing when it does not decode.
 *
 * `areas.geo_paths` holds whatever was written to it, and a card that draws a map is not the place
 * to find out that one entry is malformed: the throw would take the whole feed with it.
 *
 * Cached because a feed scrolls the same areas repeatedly and decoding is not free. Unbounded, and
 * deliberately so at this size: one entry per distinct path a session ever sees.
 */
export function decodeApproach(encoded: string): Coords[][] {
  const cached = approachCache.get(encoded)
  if (cached != null) {
    return cached
  }

  let decoded: Coords[][]
  try {
    decoded = [decodePath(encoded).map(([lat, long]) => ({ lat, long }))]
  } catch {
    decoded = []
  }

  approachCache.set(encoded, decoded)
  return decoded
}
