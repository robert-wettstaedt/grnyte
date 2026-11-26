import { transformExtent } from 'ol/proj.js'
import {
  BBOX_PLACEHOLDER,
  fillBbox,
  isValidBounds,
  MAX_MERCATOR_LAT,
  unionBounds,
  type LonLatBounds,
  type MapLayer,
} from './settings'

const TIMEOUT_MS = 8000

/** Parameters that select a GetMap image, never the service: dropped from a capabilities request. */
const GET_MAP_PARAMS = new Set([
  'BBOX',
  'CRS',
  'FORMAT',
  'HEIGHT',
  'LAYERS',
  'REQUEST',
  'SERVICE',
  'SRS',
  'STYLES',
  'TRANSPARENT',
  'VERSION',
  'WIDTH',
])

/** An ArcGIS export address: the service root, then the operation the template calls. */
const ARCGIS_EXPORT = /^(.*\/(?:MapServer|ImageServer))\/(export|exportImage)$/

interface ArcGisExtent {
  spatialReference?: { latestWkid?: number; wkid?: number }
  xmax: number
  xmin: number
  ymax: number
  ymin: number
}

type Get = (url: URL) => Promise<Response>

export function coverageImageUrl(layer: MapLayer, width: number, height: number): null | string {
  if (layer.bounds == null) {
    return null
  }

  const box = transformExtent(layer.bounds, 'EPSG:4326', 'EPSG:3857').join(',')

  if (layer.type === 'template') {
    // The template keeps its own image size; ArcGIS pads to it, so the row draws it contained.
    return fillBbox(layer.url, box)
  }

  // The defaults `TileWMS` sends, under whatever the stored address chose.
  const params: Record<string, string> = { FORMAT: 'image/png', STYLES: '', TRANSPARENT: 'true', VERSION: '1.3.0' }
  for (const [key, value] of Object.entries(layer.params ?? {})) {
    if (!['BBOX', 'CRS', 'HEIGHT', 'SRS', 'WIDTH'].includes(key)) {
      params[key] = value
    }
  }
  const url = new URL(layer.url)
  url.search = new URLSearchParams({
    ...params,
    BBOX: box,
    HEIGHT: String(height),
    [params.VERSION.startsWith('1.3') ? 'CRS' : 'SRS']: 'EPSG:3857',
    REQUEST: 'GetMap',
    SERVICE: 'WMS',
    WIDTH: String(width),
  }).toString()

  return url.toString()
}

/** Where a layer's service says it has data, or null when it says nothing usable. Never throws;
 *  `fetch` is passed in so tests replay recorded answers. */
export async function readCoverage(
  layer: MapLayer,
  fetch: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<LonLatBounds | null> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, TIMEOUT_MS)
  // Not `AbortSignal.any`: the browser floor (Safari 16.4) lacks it.
  signal?.addEventListener('abort', abort)

  const get = async (url: URL) => {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal })

    if (!response.ok || controller.signal.aborted) {
      throw new Error('unusable')
    }

    return response
  }

  try {
    const read = layer.type === 'wms' ? await readWms(layer, get) : await readArcGis(layer.url, get)

    return controller.signal.aborted || read == null ? null : usable(read)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

function childText(element: Element, localName: string): string | undefined {
  return [...element.children].find((child) => child.localName === localName)?.textContent?.trim()
}

function ownOrInheritedBox(layer: Element): LonLatBounds | null {
  for (let element: Element | null = layer; element != null; element = element.parentElement) {
    const box = [...element.children].find((child) => child.localName === 'EX_GeographicBoundingBox')

    if (element.localName === 'Layer' && box != null) {
      const [west, south, east, north] = [
        'westBoundLongitude',
        'southBoundLatitude',
        'eastBoundLongitude',
        'northBoundLatitude',
      ].map((tag) => Number(childText(box, tag)))

      return [west, south, east, north]
    }
  }

  return null
}

// fallow-ignore-next-line complexity -- private, so the CRAP estimate sees no references; coverage.test.ts covers every branch
async function readArcGis(template: string, get: Get): Promise<LonLatBounds | null> {
  let parsed: URL

  try {
    parsed = new URL(template.replaceAll(BBOX_PLACEHOLDER, '0'))
  } catch {
    return null
  }

  const match = ARCGIS_EXPORT.exec(parsed.origin + parsed.pathname)

  if (match == null) {
    return null
  }

  const [, root, operation] = match
  const infoUrl = new URL(root)
  infoUrl.searchParams.set('f', 'json')
  const info = (await (await get(infoUrl)).json()) as { extent?: ArcGisExtent; fullExtent?: ArcGisExtent }
  const extent = info.fullExtent ?? info.extent
  const wkid = extent?.spatialReference?.latestWkid ?? extent?.spatialReference?.wkid

  if (extent == null || wkid == null) {
    return null
  }

  // The server converts to degrees, but stretches the answer to the image's shape: a wide image
  // pads the longitudes, a tall one the latitudes. So each axis comes from the call that keeps it.
  const inDegrees = async (size: string) => {
    const url = new URL(`${root}/${operation}`)
    url.search = new URLSearchParams({
      bbox: [extent.xmin, extent.ymin, extent.xmax, extent.ymax].join(','),
      bboxSR: String(wkid),
      f: 'json',
      imageSR: '4326',
      size,
    }).toString()

    return ((await (await get(url)).json()) as { extent?: ArcGisExtent }).extent
  }

  // Tiny images: only their shape matters, and a server renders each one (4096 px took 14 s cold).
  const [tall, wide] = await Promise.all([inDegrees('2,256'), inDegrees('256,2')])

  return tall == null || wide == null ? null : [tall.xmin, wide.ymin, tall.xmax, wide.ymax]
}

async function readWms(layer: Extract<MapLayer, { type: 'wms' }>, get: Get): Promise<LonLatBounds | null> {
  const params = layer.params ?? {}
  const names = (params.LAYERS ?? '').split(',').map((name) => name.trim())
  const url = new URL(layer.url)

  for (const [key, value] of Object.entries(params)) {
    if (!GET_MAP_PARAMS.has(key.toUpperCase())) {
      url.searchParams.set(key, value)
    }
  }
  url.searchParams.set('SERVICE', 'WMS')
  url.searchParams.set('REQUEST', 'GetCapabilities')
  url.searchParams.set('VERSION', '1.3.0')

  const xml = new DOMParser().parseFromString(await (await get(url)).text(), 'application/xml')

  if (xml.getElementsByTagName('parsererror').length > 0) {
    return null
  }

  const layers = [...xml.getElementsByTagName('Layer')]
  const boxes = names.map((name) => {
    const named = layers.find((element) => childText(element, 'Name') === name)
    return named == null ? null : ownOrInheritedBox(named)
  })

  return boxes.every((found) => found != null) && boxes.length > 0 ? unionBounds(boxes) : null
}

function usable([west, south, east, north]: LonLatBounds): LonLatBounds | null {
  const clamped = [
    Math.max(west, -180),
    Math.max(south, -MAX_MERCATOR_LAT),
    Math.min(east, 180),
    Math.min(north, MAX_MERCATOR_LAT),
  ]

  return isValidBounds(clamped) ? clamped : null
}
