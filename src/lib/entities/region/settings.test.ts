import { formError } from '$lib/forms/schemas'
import { describe, expect, it } from 'vitest'
import {
  BBOX_PLACEHOLDER,
  layerUrl,
  mapLayerKey,
  mapLayerSchema,
  mapLayerSegment,
  mergeMapLayers,
  readRegionSettings,
  regionSettingsSchema,
  toLayerForm,
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

const TEMPLATE_URL =
  'https://gis.example.com/arcgis/rest/services/Relief/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&f=image'

const TEMPLATE: MapLayer = {
  attributions: ['Relief: State Office'],
  minZoom: 14,
  name: 'Relief',
  opacity: 0.7,
  type: 'template',
  url: TEMPLATE_URL,
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

  it('seeds the form with a stored template address exactly as it was pasted', () => {
    // ArcGIS image services take JSON in the query, which `URL` would percent-encode.
    const url = `https://gis.example.com/ImageServer/exportImage?bbox=${BBOX_PLACEHOLDER}&renderingRule={"rasterFunction":"Hillshade"}`

    expect(toLayerForm({ ...TEMPLATE, url }).url).toBe(url)
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
    // The message names both accepted forms, so it carries the placeholder to show.
    expect(result.error?.issues[0].message).toBe(formError('form_wmsUrlInvalid', { placeholder: BBOX_PLACEHOLDER }))
  })

  it('stores an address carrying the bbox placeholder as a template, exactly as pasted', () => {
    expect(mapLayerSchema.parse({ ...toLayerForm(BARE), url: TEMPLATE_URL })).toEqual({
      ...BARE,
      params: undefined,
      type: 'template',
      url: TEMPLATE_URL,
    })
  })

  it('round-trips a maximum zoom, past which the map enlarges the last tiles', () => {
    const capped: MapLayer = { ...TEMPLATE, maxZoom: 15 }

    expect(mapLayerSchema.parse(toLayerForm(capped))).toEqual(capped)
    expect(mapLayerSchema.safeParse({ ...toLayerForm(capped), maxZoom: '29' }).success).toBe(false)
  })

  it('reads back a stored edge so close to 0 that it prints in exponent form', () => {
    const covered: MapLayer = { ...TEMPLATE, bounds: [1e-7, 46, 13, 47] }

    expect(toLayerForm(covered).bounds).toBe('1e-7,46,13,47')
    expect(mapLayerSchema.parse(toLayerForm(covered))).toEqual(covered)
  })

  it('round-trips a coverage, and stores none when the field is empty', () => {
    const covered: MapLayer = { ...TEMPLATE, bounds: [10.08, 46.62, 13.03, 47.78] }

    expect(toLayerForm(covered).bounds).toBe('10.08,46.62,13.03,47.78')
    expect(mapLayerSchema.parse(toLayerForm(covered))).toEqual(covered)
    expect(mapLayerSchema.parse({ ...toLayerForm(covered), bounds: '  ' })).not.toHaveProperty('bounds')
    expect(mapLayerSchema.parse({ ...toLayerForm(covered), bounds: ' 10.08, 46.62 ,13.03,47.78 ' })).toEqual(covered)
  })

  it('refuses on the coverage field what the stored read would drop', () => {
    for (const bounds of ['10,86,13,87', '13,46,10,47', '10,46,181,47', '10,46,13', 'a,b,c,d']) {
      const result = mapLayerSchema.safeParse({ ...toLayerForm(TEMPLATE), bounds })

      expect(result.success, bounds).toBe(false)
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([['bounds']])
      expect(result.error?.issues[0].message).toBe(formError('form_boundsInvalid'))
    }
  })

  it('rejects a zoom outside the range the map can render', () => {
    expect(mapLayerSchema.safeParse({ ...toLayerForm(BARE), minZoom: '29' }).success).toBe(false)
  })

  it('rejects an opacity outside 0..1', () => {
    expect(mapLayerSchema.safeParse({ ...toLayerForm(BARE), opacity: '2' }).success).toBe(false)
  })
})

describe('layerUrl', () => {
  it('splits the query string off into params', () => {
    expect(layerUrl.parse('https://wms.example.com/service?LAYERS=topo&FORMAT=image/png')).toEqual({
      params: { FORMAT: 'image/png', LAYERS: 'topo' },
      type: 'wms',
      url: 'https://wms.example.com/service',
    })
  })

  it('uppercases parameter names, which the spec allows and OpenLayers requires', () => {
    // OpenLayers reads params.VERSION and params.LAYERS verbatim and merges the rest over its own
    // uppercase defaults, so a lowercase `format` would be sent as a second, ignored parameter.
    expect(layerUrl.parse('https://wms.example.com/service?layers=topo&version=1.1.1')).toEqual({
      params: { LAYERS: 'topo', VERSION: '1.1.1' },
      type: 'wms',
      url: 'https://wms.example.com/service',
    })
  })

  it('rejects a url that names no layer', () => {
    expect(layerUrl.safeParse('https://wms.example.com/service?FORMAT=image/png').success).toBe(false)
  })

  it('trims a template pasted with surrounding whitespace, so the same service keys the same', () => {
    expect(layerUrl.parse(` ${TEMPLATE_URL}\n`)).toEqual({ type: 'template', url: TEMPLATE_URL })
  })

  it('refuses the bbox placeholder over plain http', () => {
    expect(layerUrl.safeParse(TEMPLATE_URL.replace('https:', 'http:')).success).toBe(false)
  })

  it('rejects anything that is not an absolute http(s) url', () => {
    expect(layerUrl.safeParse('wms.example.com/service?LAYERS=topo').success).toBe(false)
    expect(layerUrl.safeParse('ftp://wms.example.com/service?LAYERS=topo').success).toBe(false)
    expect(layerUrl.safeParse('').success).toBe(false)
  })
})

describe('readRegionSettings', () => {
  it('drops a stored maximum zoom the map cannot build a grid for, rather than throwing on the map', () => {
    const stored = readRegionSettings({
      mapLayers: [FULL, { ...TEMPLATE, maxZoom: 15.5 }, { ...TEMPLATE, maxZoom: 1e10 }],
    })

    expect(stored.settings.mapLayers).toEqual([FULL])
    expect(stored.layersComplete).toBe(false)
  })

  it('keeps a stored maximum zoom from 0 to 28 and drops one just outside', () => {
    const capped = [0, 28, -1, 29].map((maxZoom) => ({ ...TEMPLATE, maxZoom, name: String(maxZoom) }))

    expect(readRegionSettings({ mapLayers: capped }).settings.mapLayers.map((layer) => layer.name)).toEqual(['0', '28'])
  })

  it('reads a stored maximum zoom and lets the editor write it back', () => {
    const stored = readRegionSettings({ mapLayers: [{ ...TEMPLATE, maxZoom: 15 }] })

    expect(stored.settings.mapLayers).toEqual([{ ...TEMPLATE, maxZoom: 15 }])
    expect(stored.layersComplete).toBe(true)
  })

  it('reads a stored coverage and lets the editor write it back', () => {
    const covered: MapLayer = { ...TEMPLATE, bounds: [10.08, 46.62, 13.03, 47.78] }
    const stored = readRegionSettings({ mapLayers: [covered] })

    expect(stored.settings.mapLayers).toEqual([covered])
    expect(stored.layersComplete).toBe(true)
  })

  it('drops only the layer whose stored coverage the map could not use', () => {
    const bad: unknown[] = [
      [13, 46, 10, 47], // west not below east
      [10, 46, 10, 47], // no width at all
      [10, 47, 13, 47], // south not below north
      [-181, 46, 13, 47],
      [10, 46, 181, 47],
      [10, -86, 13, 47], // beyond what Web Mercator projects
      [10, 46, 13, 85.06],
      [10, 46, 13],
      '10,46,13,47',
    ]
    const layers = bad.map((bounds, index) => ({ ...TEMPLATE, bounds, name: `bad ${index}` }))
    const stored = readRegionSettings({
      mapLayers: [FULL, ...layers, { ...TEMPLATE, bounds: [-180, -85.0511, 180, 85.0511] }],
    })

    expect(stored.settings.mapLayers.map((layer) => layer.name)).toEqual([FULL.name, TEMPLATE.name])
    expect(stored.layersComplete).toBe(false)
  })

  it('reads a stored bbox template layer whole, beside a wms one, and lets the editor write both back', () => {
    const stored = readRegionSettings({ mapLayers: [FULL, TEMPLATE] })

    expect(stored.settings.mapLayers).toEqual([FULL, TEMPLATE])
    expect(stored.layersComplete).toBe(true)
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

describe('mapLayerSegment', () => {
  it('names a layer by its address and parameters only, short enough for a URL', () => {
    const segment = mapLayerSegment(FULL)

    expect(segment).toMatch(/^[0-9a-z]{1,8}$/)
    expect(mapLayerSegment({ ...FULL, name: 'Renamed', opacity: 0.2 })).toBe(segment)
    expect(mapLayerSegment({ ...FULL, params: { LAYERS: 'other' } })).not.toBe(segment)
  })
})

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

  it('draws a template two regions both store once, still as a template', () => {
    const merged = mergeMapLayers([TEMPLATE, { ...TEMPLATE, name: 'Schummerung' }])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ type: 'template', url: TEMPLATE_URL })
  })

  it('keeps two different template addresses apart', () => {
    expect(mergeMapLayers([TEMPLATE, { ...TEMPLATE, url: `${TEMPLATE_URL}&layers=show:1` }])).toHaveLength(2)
  })

  it('takes the lowest zoom cap any region set, since a cap only hides a service placeholder', () => {
    expect(
      mergeMapLayers([
        { ...TEMPLATE, maxZoom: 16 },
        { ...TEMPLATE, maxZoom: 15 },
      ])[0].maxZoom,
    ).toBe(15)
    expect(mergeMapLayers([TEMPLATE, { ...TEMPLATE, maxZoom: 15 }])[0].maxZoom).toBe(15)
    expect(mergeMapLayers([TEMPLATE, TEMPLATE])[0].maxZoom).toBeUndefined()
  })

  it('covers the union of the duplicates, since each region relies on its own ground', () => {
    expect(
      mergeMapLayers([
        { ...TEMPLATE, bounds: [10, 46, 12, 47] },
        { ...TEMPLATE, bounds: [11, 45, 13, 46.5] },
      ])[0].bounds,
    ).toEqual([10, 45, 13, 47])
  })

  it('covers everywhere when any duplicate has no coverage, even when the covered one comes first', () => {
    // First, because the merge spreads the first duplicate: its rectangle must not survive.
    expect(mergeMapLayers([{ ...TEMPLATE, bounds: [10, 46, 12, 47] }, TEMPLATE])[0].bounds).toBeUndefined()
  })

  it('leaves a layer only one region has untouched', () => {
    expect(mergeMapLayers([FULL])).toEqual([FULL])
  })
})
