import { describe, expect, it } from 'vitest'
import { coverageImageUrl, readCoverage } from './coverage'
import type { MapLayer } from './settings'

const WMS: MapLayer = {
  attributions: null,
  minZoom: null,
  name: 'Relief',
  opacity: null,
  // Everything a pasted GetMap address carries, so the capabilities request must shed all of it.
  params: {
    BBOX: '1,2,3,4',
    CRS: 'EPSG:3857',
    FORMAT: 'image/png',
    HEIGHT: '256',
    LAYERS: 'relief',
    MAP: 'terrain.map',
    REQUEST: 'GetMap',
    SERVICE: 'WMS',
    SRS: 'EPSG:3857',
    STYLES: '',
    TRANSPARENT: 'true',
    VERSION: '1.1.1',
    WIDTH: '256',
  },
  type: 'wms',
  url: 'https://wms.example.test/service',
}

const ARCGIS: MapLayer = {
  attributions: null,
  minZoom: null,
  name: 'Relief',
  opacity: null,
  type: 'template',
  url: 'https://gis.example.test/arcgis/rest/services/Relief/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&f=image',
}

const box = (west: number, south: number, east: number, north: number) =>
  `<EX_GeographicBoundingBox><westBoundLongitude>${west}</westBoundLongitude><eastBoundLongitude>${east}</eastBoundLongitude><southBoundLatitude>${south}</southBoundLatitude><northBoundLatitude>${north}</northBoundLatitude></EX_GeographicBoundingBox>`

// Trimmed from a state service's 1.3.0 capabilities: a root layer with a box, children with or
// without their own.
const CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Capability>
    <Layer>
      <Title>terrain</Title>
      ${box(9.5, 46.6, 13.1, 47.8)}
      <Layer queryable="1">
        <Name>relief</Name>
        ${box(10.08, 46.62, 13.03, 47.78)}
      </Layer>
      <Layer queryable="1">
        <Name>slope</Name>
        ${box(9.53, 46.84, 10.24, 47.6)}
      </Layer>
      <Layer queryable="1">
        <Name>inherits</Name>
      </Layer>
      <Layer queryable="1">
        <Name>world</Name>
        ${box(-180, -90, 180, 90)}
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`

type Answer = { body: string; ok?: boolean }

/** A `fetch` that answers from a table and records what it was asked, with which options. */
function recorder(answers: Record<string, Answer>) {
  const requests: { init?: RequestInit; url: URL }[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    requests.push({ init, url })
    const key = Object.keys(answers).find((prefix) => url.href.startsWith(prefix.split('#')[0]) && matches(prefix, url))
    const answer = key == null ? undefined : answers[key]

    if (answer == null) {
      throw new TypeError('Failed to fetch')
    }

    return new Response(answer.body, { status: answer.ok === false ? 500 : 200 })
  }) as typeof globalThis.fetch

  return { fetch, requests }
}

// A prefix ending in `size=` picks the wide or tall export call by the size that follows.
const matches = (prefix: string, url: URL) =>
  !prefix.includes('#') || url.searchParams.get('size') === prefix.split('#')[1]

describe('readCoverage, WMS', () => {
  const caps = { 'https://wms.example.test/service': { body: CAPABILITIES } }

  it("takes the named layer's own geographic box from the capabilities", async () => {
    const { fetch, requests } = recorder(caps)

    expect(await readCoverage(WMS, fetch)).toEqual([10.08, 46.62, 13.03, 47.78])
    // The service's own parameters (a MapServer `MAP`) stay; the GetMap ones do not.
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      MAP: 'terrain.map',
      REQUEST: 'GetCapabilities',
      SERVICE: 'WMS',
      VERSION: '1.3.0',
    })
    expect(requests[0].init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  })

  it("gives a layer without its own box its parent's", async () => {
    const { fetch } = recorder(caps)

    expect(await readCoverage({ ...WMS, params: { LAYERS: 'inherits' } }, fetch)).toEqual([9.5, 46.6, 13.1, 47.8])
  })

  it('joins several named layers into one rectangle', async () => {
    const { fetch } = recorder(caps)

    expect(await readCoverage({ ...WMS, params: { LAYERS: 'relief, slope' } }, fetch)).toEqual([
      9.53, 46.62, 13.03, 47.78,
    ])
  })

  it('clamps a world-wide box to what the map can project', async () => {
    const { fetch } = recorder(caps)

    expect(await readCoverage({ ...WMS, params: { LAYERS: 'world' } }, fetch)).toEqual([-180, -85.0511, 180, 85.0511])
  })

  it('gives nothing for an unknown layer name, bad XML or a failed request', async () => {
    expect(await readCoverage({ ...WMS, params: { LAYERS: 'relief,missing' } }, recorder(caps).fetch)).toBeNull()
    expect(
      await readCoverage(WMS, recorder({ 'https://wms.example.test/service': { body: '<oops' } }).fetch),
    ).toBeNull()
    expect(await readCoverage(WMS, recorder({}).fetch)).toBeNull()
    expect(
      await readCoverage(
        WMS,
        recorder({ 'https://wms.example.test/service': { body: CAPABILITIES, ok: false } }).fetch,
      ),
    ).toBeNull()
  })
})

describe('readCoverage, ArcGIS template', () => {
  const root = 'https://gis.example.test/arcgis/rest/services/Relief/MapServer'
  const info = JSON.stringify({
    fullExtent: {
      spatialReference: { latestWkid: 31258, wkid: 31258 },
      xmax: 502500.5,
      xmin: 352499.5,
      ymax: 325000.25,
      ymin: 199999.25,
    },
  })
  const extent = (xmin: number, ymin: number, xmax: number, ymax: number) =>
    JSON.stringify({ extent: { spatialReference: { wkid: 4326 }, xmax, xmin, ymax, ymin } })
  // The server stretches its answer to the image's shape: a wide image pads the longitudes, a tall
  // one the latitudes, so each answer is exact on the other axis.
  const answers = {
    [`${root}/export?#2,256`]: { body: extent(12.08, 45.5, 13.99, 49.5) },
    [`${root}/export?#256,2`]: { body: extent(10.5, 46.94, 15.6, 48.04) },
    [`${root}?`]: { body: info },
  }

  it('asks the service for its extent, then converts it to degrees one axis at a time', async () => {
    const { fetch, requests } = recorder(answers)

    expect(await readCoverage(ARCGIS, fetch)).toEqual([12.08, 46.94, 13.99, 48.04])
    expect(requests.map(({ url }) => url.searchParams.get('f'))).toEqual(['json', 'json', 'json'])
    expect(Object.fromEntries(requests[1].url.searchParams)).toMatchObject({
      bbox: '352499.5,199999.25,502500.5,325000.25',
      bboxSR: '31258',
      imageSR: '4326',
    })
    expect(requests.every(({ init }) => init?.credentials === 'omit')).toBe(true)
  })

  it('reads an ImageServer template the same way, through exportImage', async () => {
    const imageRoot = 'https://gis.example.test/arcgis/rest/services/Terrain/ImageServer'
    const { fetch } = recorder({
      [`${imageRoot}/exportImage?#2,256`]: { body: extent(12.08, 45.5, 13.99, 49.5) },
      [`${imageRoot}/exportImage?#256,2`]: { body: extent(10.5, 46.94, 15.6, 48.04) },
      [`${imageRoot}?`]: { body: info },
    })
    const template = `${imageRoot}/exportImage?bbox={bbox-epsg-3857}&renderingRule={"rasterFunction":"Hillshade"}`

    expect(await readCoverage({ ...ARCGIS, url: template }, fetch)).toEqual([12.08, 46.94, 13.99, 48.04])
  })

  it('asks nothing of a template that is not an ArcGIS export', async () => {
    const { fetch, requests } = recorder(answers)

    expect(
      await readCoverage({ ...ARCGIS, url: 'https://tiles.example.test/relief?bbox={bbox-epsg-3857}' }, fetch),
    ).toBeNull()
    expect(requests).toEqual([])
  })

  it('takes the extent and the system number wherever the service puts them', async () => {
    // An `extent` instead of `fullExtent`, and only `wkid`: the shape ImageServers answer with.
    const plain = JSON.stringify({
      extent: { spatialReference: { wkid: 31255 }, xmax: 123520.25, xmin: -43738.75, ymax: 404181.75, ymin: 257902.75 },
    })
    const { fetch, requests } = recorder({ ...answers, [`${root}?`]: { body: plain } })

    expect(await readCoverage(ARCGIS, fetch)).toEqual([12.08, 46.94, 13.99, 48.04])
    expect(requests[1].url.searchParams.get('bboxSR')).toBe('31255')
  })

  it('gives nothing when the service names no extent or no system, or converts nothing', async () => {
    const noExtent = recorder({ ...answers, [`${root}?`]: { body: '{}' } })
    const noSystem = recorder({
      ...answers,
      [`${root}?`]: { body: JSON.stringify({ fullExtent: { xmax: 2, xmin: 1, ymax: 2, ymin: 1 } }) },
    })
    const noAnswer = recorder({ ...answers, [`${root}/export?#256,2`]: { body: '{}' } })

    expect(await readCoverage(ARCGIS, noExtent.fetch)).toBeNull()
    expect(noExtent.requests).toHaveLength(1)
    expect(await readCoverage(ARCGIS, noSystem.fetch)).toBeNull()
    expect(noSystem.requests).toHaveLength(1)
    expect(await readCoverage(ARCGIS, noAnswer.fetch)).toBeNull()
  })

  it('asks nothing of a template that is not a URL', async () => {
    const { fetch, requests } = recorder(answers)

    expect(
      await readCoverage({ ...ARCGIS, url: 'https://gis example/MapServer/export?bbox={bbox-epsg-3857}' }, fetch),
    ).toBeNull()
    expect(requests).toEqual([])
  })

  it('gives nothing when the service fails or the read is aborted', async () => {
    expect(await readCoverage(ARCGIS, recorder({}).fetch)).toBeNull()

    const controller = new AbortController()
    const pending = readCoverage(ARCGIS, recorder(answers).fetch, controller.signal)
    controller.abort()
    expect(await pending).toBeNull()
  })
})

describe('coverageImageUrl', () => {
  // A quarter of the world: 90 E is x = HALF_SIZE / 2, and 66.51326044311186 N is y = HALF_SIZE / 2.
  const bounds: [number, number, number, number] = [0, 0, 90, 66.51326044311186]
  const corner = 20037508.342789244 / 2
  const base = { attributions: null, bounds, minZoom: null, name: 'Relief', opacity: null }
  const numbers = (text: null | string) => (text ?? '').split(',').map(Number)

  it('asks a WMS for one image of the whole coverage, over any size the stored address carried', () => {
    const url = new URL(
      coverageImageUrl(
        {
          ...base,
          params: { BBOX: '1,2,3,4', LAYERS: 'relief', SRS: 'EPSG:4326', VERSION: '1.3.0', WIDTH: '256' },
          type: 'wms',
          url: 'https://wms.example.test/service',
        },
        96,
        72,
      ) ?? '',
    )
    const bbox = numbers(url.searchParams.get('BBOX'))

    expect(url.origin + url.pathname).toBe('https://wms.example.test/service')
    expect(bbox[0]).toBeCloseTo(0)
    expect(bbox[1]).toBeCloseTo(0)
    expect(bbox[2]).toBeCloseTo(corner)
    expect(bbox[3]).toBeCloseTo(corner)
    expect(Object.fromEntries([...url.searchParams].filter(([key]) => key !== 'BBOX'))).toEqual({
      CRS: 'EPSG:3857',
      FORMAT: 'image/png',
      HEIGHT: '72',
      LAYERS: 'relief',
      REQUEST: 'GetMap',
      SERVICE: 'WMS',
      STYLES: '',
      TRANSPARENT: 'true',
      VERSION: '1.3.0',
      WIDTH: '96',
    })
  })

  it('asks for WMS 1.3.0 with a CRS when the stored address names no version', () => {
    const url = new URL(
      coverageImageUrl(
        { ...base, params: { LAYERS: 'relief' }, type: 'wms', url: 'https://wms.example.test/s' },
        96,
        72,
      ) ?? '',
    )

    expect(url.searchParams.get('VERSION')).toBe('1.3.0')
    expect(url.searchParams.get('CRS')).toBe('EPSG:3857')
  })

  it('names the projection SRS for a WMS 1.1.1 service, dropping a stored CRS', () => {
    const url = new URL(
      coverageImageUrl(
        {
          ...base,
          params: { CRS: 'EPSG:4326', LAYERS: 'relief', VERSION: '1.1.1' },
          type: 'wms',
          url: 'https://wms.example.test/service',
        },
        96,
        72,
      ) ?? '',
    )

    expect(url.searchParams.get('SRS')).toBe('EPSG:3857')
    expect(url.searchParams.has('CRS')).toBe(false)
  })

  it('fills a template with the coverage box', () => {
    const url = coverageImageUrl(
      { ...base, type: 'template', url: 'https://x.test/export?bbox={bbox-epsg-3857}&f=image' },
      96,
      72,
    )
    const box = numbers(/bbox=([^&]+)/.exec(url ?? '')?.[1] ?? null)

    expect(url?.startsWith('https://x.test/export?bbox=')).toBe(true)
    expect(box).toHaveLength(4)
    ;[0, 0, corner, corner].forEach((expected, index) => expect(box[index]).toBeCloseTo(expected))
  })

  it('asks nothing for a layer without coverage', () => {
    expect(
      coverageImageUrl({ ...base, bounds: null, type: 'template', url: 'https://x.test/{bbox-epsg-3857}' }, 96, 72),
    ).toBeNull()
  })
})
