import { describe, expect, it } from 'vitest'
import { mapLayerSchema, regionSettingsSchema, toLayerForm, wmsUrl, type MapLayer } from './mapLayers'

const FULL: MapLayer = {
  attributions: ['Data: Survey Office', 'Imagery: Region'],
  minZoom: 12,
  name: 'Topographic',
  opacity: 0.5,
  params: { FORMAT: 'image/png', LAYERS: 'topo' },
  type: 'wms',
  url: 'https://wms.example.com/service',
}

const BARE: MapLayer = {
  attributions: null,
  minZoom: null,
  name: 'Bare layer',
  opacity: null,
  params: { LAYERS: 'topo' },
  type: 'wms',
  url: 'https://wms.example.com/service',
}

describe('mapLayerSchema', () => {
  it('round-trips a layer with every field set', () => {
    // The round-trip is the point: it covers the null handling, the attribution lines and the
    // `type` literal, none of which the url helpers on their own can be wrong about.
    expect(mapLayerSchema.parse(toLayerForm(FULL))).toEqual(FULL)
  })

  it('round-trips a layer with every optional field absent', () => {
    expect(mapLayerSchema.parse(toLayerForm(BARE))).toEqual(BARE)
  })

  it('reads one attribution per line and drops blank ones', () => {
    expect(mapLayerSchema.parse({ ...toLayerForm(BARE), attributions: 'First\n\n  Second  \n' })).toMatchObject({
      attributions: ['First', 'Second'],
    })
  })

  it('stores an empty attribution box as absent rather than an empty list', () => {
    expect(mapLayerSchema.parse({ ...toLayerForm(BARE), attributions: '   \n  ' })).toMatchObject({
      attributions: null,
    })
  })

  it('reports an unusable url against the url field, so the error lands on that input', () => {
    const result = mapLayerSchema.safeParse({ ...toLayerForm(BARE), url: 'not a url' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['url']])
  })

  it('rejects a zoom outside the range the map can render', () => {
    expect(mapLayerSchema.safeParse({ ...toLayerForm(BARE), minZoom: '29' }).success).toBe(false)
  })

  it('rejects an opacity outside 0..1', () => {
    expect(mapLayerSchema.safeParse({ ...toLayerForm(BARE), opacity: '2' }).success).toBe(false)
  })
})

describe('wmsUrl', () => {
  it('splits the query string off into params', () => {
    expect(wmsUrl.parse('https://wms.example.com/service?LAYERS=topo&FORMAT=image/png')).toEqual({
      params: { FORMAT: 'image/png', LAYERS: 'topo' },
      url: 'https://wms.example.com/service',
    })
  })

  it('uppercases parameter names, which the spec allows and OpenLayers requires', () => {
    // OpenLayers reads params.VERSION and params.LAYERS verbatim and merges the rest over its own
    // uppercase defaults, so a lowercase `format` would be sent as a second, ignored parameter.
    expect(wmsUrl.parse('https://wms.example.com/service?layers=topo&version=1.1.1')).toEqual({
      params: { LAYERS: 'topo', VERSION: '1.1.1' },
      url: 'https://wms.example.com/service',
    })
  })

  it('rejects a url that names no layer', () => {
    expect(wmsUrl.safeParse('https://wms.example.com/service?FORMAT=image/png').success).toBe(false)
  })

  it('rejects anything that is not an absolute http(s) url', () => {
    expect(wmsUrl.safeParse('wms.example.com/service?LAYERS=topo').success).toBe(false)
    expect(wmsUrl.safeParse('ftp://wms.example.com/service?LAYERS=topo').success).toBe(false)
    expect(wmsUrl.safeParse('').success).toBe(false)
  })
})

describe('regionSettingsSchema', () => {
  it('reads a blob that predates map layers as having none', () => {
    expect(regionSettingsSchema.parse({}).mapLayers).toEqual([])
  })

  it('refuses a blob that is not settings at all, so the caller can fall back', () => {
    expect(regionSettingsSchema.safeParse(null).success).toBe(false)
    expect(regionSettingsSchema.safeParse({ mapLayers: 'nonsense' }).success).toBe(false)
  })

  it('keeps a stored layer intact', () => {
    expect(regionSettingsSchema.parse({ mapLayers: [FULL] })).toEqual({ mapLayers: [FULL] })
  })
})
