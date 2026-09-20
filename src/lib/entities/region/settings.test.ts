import { describe, expect, it } from 'vitest'
import {
  mapLayerKey,
  mapLayerSchema,
  mergeMapLayers,
  regionSettingsSchema,
  toLayerForm,
  wmsUrl,
  type MapLayer,
} from './settings'
import { DEFAULT_TAGS } from './tagVocabulary'

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

  it('reads a blob that predates region tags as having the defaults, without losing its layers', () => {
    expect(regionSettingsSchema.parse({}).tags).toEqual(DEFAULT_TAGS)
    expect(regionSettingsSchema.parse({ mapLayers: [FULL] })).toEqual({ mapLayers: [FULL], tags: DEFAULT_TAGS })
  })

  it('keeps an emptied vocabulary empty, since only an absent key means the defaults', () => {
    expect(regionSettingsSchema.parse({ tags: [] }).tags).toEqual([])
  })
})

/** The same overlay as `FULL`, as a second region stored it: same endpoint and parameters, every
 *  other field deliberately different, so each merge rule is separately falsifiable. */
const FULL_ELSEWHERE: MapLayer = {
  attributions: ['Imagery: Region', 'Relief: Cantonal Office'],
  minZoom: 8,
  name: 'Topo map',
  opacity: 0.8,
  params: { FORMAT: 'image/png', LAYERS: 'topo' },
  type: 'wms',
  url: 'https://wms.example.com/service',
}

const OTHER_LAYER: MapLayer = { ...BARE, name: 'Relief', params: { LAYERS: 'relief' } }

describe('mapLayerKey', () => {
  it('ignores the order parameters happen to be stored in', () => {
    expect(mapLayerKey({ ...FULL, params: { FORMAT: 'image/png', LAYERS: 'topo' } })).toBe(
      // eslint-disable-next-line perfectionist/sort-objects -- the unsorted order is the test
      mapLayerKey({ ...FULL, params: { LAYERS: 'topo', FORMAT: 'image/png' } }),
    )
  })

  it('reads no parameters and none stored as the same layer', () => {
    expect(mapLayerKey({ ...FULL, params: null })).toBe(mapLayerKey({ ...FULL, params: {} }))
  })

  it("separates one endpoint's layers, which is the common shape of a public wms server", () => {
    expect(mapLayerKey(BARE)).not.toBe(mapLayerKey(OTHER_LAYER))
  })
})

describe('mergeMapLayers', () => {
  it('draws an overlay two regions both store exactly once', () => {
    expect(mergeMapLayers([FULL, FULL_ELSEWHERE])).toHaveLength(1)
  })

  it('collapses a duplicate stored twice inside one region', () => {
    expect(mergeMapLayers([BARE, { ...BARE, name: 'Copy' }])).toHaveLength(1)
  })

  it('keeps layers that differ only in the parameters selecting them', () => {
    expect(mergeMapLayers([BARE, OTHER_LAYER]).map((layer) => layer.name)).toEqual(['Bare layer', 'Relief'])
  })

  it('names the merged layer after both regions when they disagree', () => {
    expect(mergeMapLayers([FULL, FULL_ELSEWHERE])[0].name).toBe('Topographic / Topo map')
  })

  it('names it once when the two spellings differ only in case or spacing', () => {
    const merged = mergeMapLayers([FULL, { ...FULL_ELSEWHERE, name: ' topographic ' }])

    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Topographic')
  })

  it('takes the lowest zoom floor, and none at all if either region set none', () => {
    expect(mergeMapLayers([FULL, FULL_ELSEWHERE])[0].minZoom).toBe(8)
    expect(mergeMapLayers([FULL, { ...FULL_ELSEWHERE, minZoom: null }])[0].minZoom).toBeNull()
  })

  it('takes the most opaque, and full opacity if either region set none', () => {
    expect(mergeMapLayers([FULL, FULL_ELSEWHERE])[0].opacity).toBe(0.8)
    expect(mergeMapLayers([FULL, { ...FULL_ELSEWHERE, opacity: null }])[0].opacity).toBeNull()
  })

  it('credits both regions, without repeating a credit they share', () => {
    expect(mergeMapLayers([FULL, FULL_ELSEWHERE])[0].attributions).toEqual([
      'Data: Survey Office',
      'Imagery: Region',
      'Relief: Cantonal Office',
    ])
  })

  it('leaves a layer nobody credits uncredited', () => {
    const merged = mergeMapLayers([BARE, { ...BARE, name: 'Copy' }])

    expect(merged).toHaveLength(1)
    expect(merged[0].attributions).toBeNull()
  })

  it('leaves a merged layer where the first region drew it, so its stacking is unchanged', () => {
    expect(mergeMapLayers([OTHER_LAYER, FULL, FULL_ELSEWHERE]).map((layer) => layer.name)).toEqual([
      'Relief',
      'Topographic / Topo map',
    ])
  })

  it('leaves a layer only one region has untouched', () => {
    expect(mergeMapLayers([FULL])).toEqual([FULL])
  })
})
