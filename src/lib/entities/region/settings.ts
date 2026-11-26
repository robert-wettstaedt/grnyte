import { fingerprint } from '$lib/forms/fingerprint'
import { formError, nameSchema, stringToIntOptional, stringToNumberOptional } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { DEFAULT_TAGS } from './tagVocabulary'

/** `[west, south, east, north]` in degrees, the order MapLibre's raster `bounds` takes. */
export type LonLatBounds = [number, number, number, number]

/** Web Mercator's latitude limit; OpenLayers cannot project an extent past it. */
export const MAX_MERCATOR_LAT = 85.0511

/** One rule for the stored read, the form and a service's answer, so none can save what another drops. */
export function isValidBounds(value: readonly number[]): value is LonLatBounds {
  if (value.length !== 4 || !value.every(Number.isFinite)) {
    return false
  }

  const [west, south, east, north] = value

  return (
    west < east &&
    south < north &&
    west >= -180 &&
    east <= 180 &&
    south >= -MAX_MERCATOR_LAT &&
    north <= MAX_MERCATOR_LAT
  )
}

/**
 * An overlay as stored: a WMS endpoint plus the parameters that select the layer, or a `template`
 * address whose `{bbox-epsg-3857}` the map fills per tile (MapLibre reads that form as is).
 *
 * Two schemas over one shape: a loose parse decides what the map draws (an unknown key is dropped
 * and the layer still shows), a strict one decides only whether the editor may write it back.
 */
const sharedShape = {
  attributions: z.nullish(z.array(z.string())),
  // The map requests no tiles outside it. A bad value drops just this layer, like `maxZoom`.
  bounds: z.nullish(
    z.tuple([z.number(), z.number(), z.number(), z.number()]).check(z.refine((value) => isValidBounds(value))),
  ),
  // Past it the map enlarges the last tiles: some services return a placeholder beyond their data.
  // Whole and in range, or OL's grid throws building the map; a bad value drops just this layer.
  maxZoom: z.nullish(z.int().check(z.gte(0), z.lte(28))),
  minZoom: z.nullish(z.number()),
  name: z.string(),
  opacity: z.nullish(z.number()),
  url: z.string(),
}
const wmsShape = { ...sharedShape, params: z.nullish(z.record(z.string(), z.string())), type: z.literal('wms') }
const templateShape = { ...sharedShape, type: z.literal('template') }

/** Reading, which is deliberately forgiving: an unknown key is dropped and the layer still draws. */
const storedMapLayerSchema = z.discriminatedUnion('type', [z.object(wmsShape), z.object(templateShape)])

/** The same shape, but rejecting a layer carrying anything else. Only ever used to answer whether
 *  a layer can be written BACK, never to decide what the map draws. */
const exactMapLayerSchema = z.discriminatedUnion('type', [z.strictObject(wmsShape), z.strictObject(templateShape)])

/**
 * A region's `settings` jsonb blob. The column is untyped at the database, so this is parsed where
 * the row enters the app (see `toRegionMembership`) rather than trusted.
 */
export const regionSettingsSchema = z.object({
  mapLayers: z._default(z.array(storedMapLayerSchema), []),
  // `z.string()` and not `tagNameSchema`: re-validating on read would let one over-long tag fail
  // the whole blob and take the region's map layers with it. A factory because `DEFAULT_TAGS` is frozen.
  tags: z._default(z.array(z.string()), () => [...DEFAULT_TAGS]),
})

export type MapLayer = RegionSettings['mapLayers'][number]

export type RegionSettings = z.infer<typeof regionSettingsSchema>

/** What a stored `settings` blob reads as, and whether each key survived the read whole. */
export interface StoredSettings {
  /** Every stored layer parsed. False when one was dropped or the blob is unreadable, so a screen
   *  must not write this key back: what it holds is short of what is stored. */
  layersComplete: boolean
  settings: RegionSettings
  /** The stored vocabulary parsed, on the same terms. */
  tagsComplete: boolean
}

/** A region with nothing configured: no layers, and the starting vocabulary a new region gets. */
export function emptyRegionSettings(): RegionSettings {
  return regionSettingsSchema.parse({})
}

/**
 * What makes two stored overlays the same one: the endpoint plus the parameters that select the
 * layer. One endpoint commonly serves several layers through `LAYERS`, so the URL alone would hide
 * one of them.
 *
 * Deliberately not `fingerprint`: this is a grouping key, never stored and never posted, so it
 * carries none of that function's forever-compatibility duty. Its hash names a layer's admin page.
 */
export function mapLayerKey(layer: MapLayer): string {
  return JSON.stringify([layer.url, sortedParams(layer) ?? []])
}

/** A layer's page segment: short, and the same for as long as its address and parameters are. */
export function mapLayerSegment(layer: MapLayer): string {
  return fingerprint(mapLayerKey(layer))
}

/** A fingerprint of the layers a form loaded, so a save proves what it replaces. A count cannot:
 *  a delete plus an add leaves it unchanged. Order and content both matter. */
export function mapLayersFingerprint(layers: MapLayer[]): string {
  const canonical = JSON.stringify(
    layers.map((layer) => [
      layer.name,
      layer.type,
      layer.url,
      layer.attributions ?? null,
      layer.minZoom ?? null,
      layer.opacity ?? null,
      sortedParams(layer),
      // Only when set, so every fingerprint from before these fields existed stays the same. Keyed,
      // so a lone cap never reads as a lone coverage.
      ...(layer.maxZoom == null ? [] : [layer.maxZoom]),
      ...(layer.bounds == null ? [] : [{ bounds: layer.bounds }]),
    ]),
  )

  return `${layers.length}-${fingerprint(canonical)}`
}

/**
 * Layers from every region the user belongs to, with an overlay stored in more than one region
 * collapsed into one. Drawing it twice means double the tile requests and a compounded opacity.
 *
 * Merged most-permissive, so nobody loses visibility they had in a region on its own, except the
 * zoom cap, which takes the strictest (see `mergedCap`). Order is each group's FIRST occurrence: a
 * member of two regions then sees the earlier region's stacking unchanged.
 */
export function mergeMapLayers(layers: MapLayer[]): MapLayer[] {
  const groups = new Map<string, MapLayer[]>()

  for (const layer of layers) {
    const key = mapLayerKey(layer)
    const group = groups.get(key)

    if (group == null) {
      groups.set(key, [layer])
    } else {
      group.push(layer)
    }
  }

  return [...groups.values()].map(mergeLayerGroup)
}

/**
 * Read a region's `settings` column. Total by construction: it runs in the auth hook and in a
 * `$derived` over every membership, so a throw is every request by every member failing.
 *
 * Per element, not per key, so one unrecognised overlay does not drop the other three. The
 * `*Complete` flags are for screens that write a key BACK: saving what was read deletes the rest.
 */
export function readRegionSettings(raw: unknown): StoredSettings {
  // Not an object (an array, a scalar): nothing round-trips. Reachable, because Postgres
  // `'[]'::jsonb || '{...}'::jsonb` appends rather than merges.
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    // `[]` and not the defaults: `regionTags` is the allowlist a route write is checked against,
    // so fabricated tags would become storable on real routes.
    return { layersComplete: false, settings: unknownRegionSettings(), tagsComplete: false }
  }

  const blob = (raw ?? {}) as Record<string, unknown>
  const storedLayers = blob.mapLayers
  const layerList = Array.isArray(storedLayers) ? storedLayers : []
  const mapLayers = layerList.flatMap((layer) => {
    const parsed = storedMapLayerSchema.safeParse(layer)
    return parsed.success ? [parsed.data] : []
  })
  // Only for the flag: a loosely parsed layer may have lost a key that `MapLayer` cannot represent.
  const exact = layerList.every((layer) => exactMapLayerSchema.safeParse(layer).success)
  // Per element here too: one unusable entry used to replace the whole vocabulary with defaults.
  const storedTags = blob.tags
  const tagList = Array.isArray(storedTags) ? storedTags : []
  const readable = tagList.filter((tag) => typeof tag === 'string')

  return {
    layersComplete:
      (storedLayers === undefined || Array.isArray(storedLayers)) && mapLayers.length === layerList.length && exact,
    settings: {
      mapLayers,
      // Absent means nothing configured, so the defaults; unreadable means unknown, so nothing.
      // Copied, never the module array: one `push` downstream would rewrite it process-wide.
      tags: storedTags === undefined ? [...DEFAULT_TAGS] : Array.isArray(storedTags) ? readable : [],
    },
    tagsComplete: storedTags === undefined || (Array.isArray(storedTags) && readable.length === tagList.length),
  }
}

/** A region nothing is known about: no row yet, or an unreadable blob. Distinct from
 *  {@link emptyRegionSettings}: a save may overwrite "nothing configured", never "not known". */
export function unknownRegionSettings(): RegionSettings {
  return { mapLayers: [], tags: [] }
}

/** A WMS layer's params in key order, or null when it has none (templates never do). Plain
 *  comparison, not `localeCompare`, for the reason `fingerprint` gives. */
function sortedParams(layer: MapLayer): [string, string][] | null {
  const params = layer.type === 'wms' ? layer.params : null

  return params == null ? null : Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Split a pasted request URL into the bare endpoint and its parameters. Null unless it is an
 * absolute http(s) URL carrying `LAYERS`.
 *
 * Parameter names are uppercased because OpenLayers reads `VERSION` and `LAYERS` off the record
 * verbatim and merges the rest over its own uppercase defaults.
 */
const parseWmsUrl = (input: string): null | { params: Record<string, string>; url: string } => {
  let parsed: URL

  try {
    parsed = new URL(input)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  const params = Object.fromEntries([...parsed.searchParams].map(([key, value]) => [key.toUpperCase(), value]))

  if (params.LAYERS == null) {
    return null
  }

  return { params, url: parsed.origin + parsed.pathname }
}

const formatWmsUrl = (params: Record<string, string>, url: string): string => {
  const parsed = new URL(url)

  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value)
  }

  return parsed.toString()
}

export const BBOX_PLACEHOLDER = '{bbox-epsg-3857}'

/** A template with its extent filled in. Characters a URL may not carry raw are percent-encoded:
 *  browsers send `{"…"}` in a query as it is, and ArcGIS answers 400; `%XX` stays as it is. */
export function fillBbox(template: string, box: string): string {
  return template.replaceAll(BBOX_PLACEHOLDER, box).replace(/[\s"<>\\^`{|}]/g, (char) => encodeURIComponent(char))
}

function parseLayerUrl(input: string) {
  if (input.includes(BBOX_PLACEHOLDER)) {
    // Verbatim, never through `URL`, which would percent-encode the braces and any JSON.
    return input.startsWith('https://') ? { type: 'template' as const, url: input } : null
  }

  const wms = parseWmsUrl(input)

  return wms == null ? null : { ...wms, type: 'wms' as const }
}

/** How a pasted URL and a stored endpoint convert into each other. Validating and splitting are
 *  one parse, so an unchecked string cannot reach the conversion. */
export const layerUrl = z.codec(
  z.string({ error: formError('form_required') }),
  z.discriminatedUnion('type', [
    z.object({ params: z.record(z.string(), z.string()), type: z.literal('wms'), url: z.string() }),
    z.object({ type: z.literal('template'), url: z.string() }),
  ]),
  {
    decode: (value, payload) => {
      // Trimmed: a pasted newline would make the same service key as a second overlay.
      const parsed = parseLayerUrl(value.trim())

      if (parsed == null) {
        payload.issues.push({
          code: 'custom',
          input: value,
          message: formError('form_wmsUrlInvalid', { placeholder: BBOX_PLACEHOLDER }),
        })
        return z.NEVER
      }

      return parsed
    },
    encode: (layer) => (layer.type === 'template' ? layer.url : formatWmsUrl(layer.params, layer.url)),
  },
)

const zoomField = z.pipe(
  stringToIntOptional,
  z.optional(
    z
      .int()
      .check(z.gte(0, { error: formError('form_numInvalid') }), z.lte(28, { error: formError('form_numInvalid') })),
  ),
)

/** The coverage as typed or filled in: `west,south,east,north`, empty for none. */
const boundsField = z.pipe(
  z.optional(z.string()),
  z.transform((value, payload): LonLatBounds | undefined => {
    const text = (value ?? '').trim()

    if (text === '') {
      return undefined
    }

    const parts = text.split(',').map((part) => part.trim())
    const numbers = parts.map(Number)

    // `Number`, not the decimal regex: a stored edge near 0 reads back as `1e-7`.
    if (parts.some((part) => part === '') || !isValidBounds(numbers)) {
      payload.issues.push({ code: 'custom', input: value, message: formError('form_boundsInvalid') })
      return z.NEVER
    }

    return numbers
  }),
)

/** One layer as the settings form submits it. Edited as a single pasted URL because remote-form
 *  field paths cannot express a record's dynamic keys. */
export const mapLayerSchema = z.pipe(
  z.object({
    // One credit per line, rather than a repeatable field inside a repeatable field.
    attributions: z.optional(z.string()),
    bounds: boundsField,
    maxZoom: zoomField,
    minZoom: zoomField,
    name: nameSchema,
    opacity: z.pipe(
      stringToNumberOptional,
      z.optional(
        z
          .number()
          .check(z.gte(0, { error: formError('form_numInvalid') }), z.lte(1, { error: formError('form_numInvalid') })),
      ),
    ),
    url: layerUrl,
  }),
  z.transform(({ attributions, bounds, maxZoom, minZoom, name, opacity, url }): MapLayer => {
    const credits = (attributions ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    return {
      attributions: credits.length === 0 ? null : credits,
      // Absent rather than null, so a layer without them stays readable by older tabs' strict parse.
      ...(bounds == null ? {} : { bounds }),
      ...(maxZoom == null ? {} : { maxZoom }),
      minZoom: minZoom ?? null,
      name,
      opacity: opacity ?? null,
      ...url,
    }
  }),
)

/** The inverse of {@link mapLayerSchema}, to seed the form from a stored layer. An absent value is
 *  the empty string, which is what the field codecs decode back to absent. */
export function toLayerForm(layer: MapLayer): z.input<typeof mapLayerSchema> {
  return {
    attributions: layer.attributions?.join('\n') ?? '',
    bounds: layer.bounds?.join(',') ?? '',
    maxZoom: layer.maxZoom == null ? '' : String(layer.maxZoom),
    minZoom: layer.minZoom == null ? '' : String(layer.minZoom),
    name: layer.name,
    opacity: layer.opacity == null ? '' : String(layer.opacity),
    url: layer.type === 'template' ? layer.url : formatWmsUrl(layer.params ?? {}, layer.url),
  }
}

export function unionBounds(boxes: LonLatBounds[]): LonLatBounds {
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ]
}

/** A credit only one of the duplicates carries still has to show: over-crediting is the safe
 *  direction for a licence. */
function mergedAttributions(group: MapLayer[]): null | string[] {
  const credits = [...new Set(group.flatMap((layer) => layer.attributions ?? []))]

  return credits.length === 0 ? null : credits
}

/** Absent reaches OpenLayers as `undefined`: no zoom floor, full opacity. So it is the most
 *  permissive value and wins outright rather than sorting as a number. */
function mergedBound(values: (null | number | undefined)[], pick: (...numbers: number[]) => number): null | number {
  const set = values.filter((value) => value != null)

  return set.length === values.length ? pick(...set) : null
}

/** The rectangle around every duplicate's coverage, or none when any has none: a missing coverage
 *  means everywhere. Always sets the key, so the first duplicate's spread rectangle cannot survive. */
function mergedBounds(group: MapLayer[]): { bounds: LonLatBounds | undefined } {
  const all = group.flatMap((layer) => (layer.bounds == null ? [] : [layer.bounds]))

  if (all.length !== group.length) {
    return { bounds: undefined }
  }

  return { bounds: unionBounds(all) }
}

/** The lowest cap any region set: a cap hides only a service's placeholder, never data, so the
 *  strictest one costs sharpness at worst. Absent when none did, like an uncapped stored layer. */
function mergedCap(group: MapLayer[]): { maxZoom?: number } {
  const caps = group.flatMap((layer) => (layer.maxZoom == null ? [] : [layer.maxZoom]))

  return caps.length === 0 ? {} : { maxZoom: Math.min(...caps) }
}

/** Compared trimmed and case-insensitively, because admins type these by hand and a stray capital
 *  would otherwise read as a second layer. The first region's spelling is the one kept. */
function mergedName(group: MapLayer[]): string {
  const names: string[] = []
  const seen = new Set<string>()

  for (const { name } of group) {
    const normalized = name.trim().toLowerCase()

    if (!seen.has(normalized)) {
      seen.add(normalized)
      names.push(name)
    }
  }

  return names.join(' / ')
}

function mergeLayerGroup(group: MapLayer[]): MapLayer {
  const [first] = group

  if (group.length === 1) {
    return first
  }

  return {
    ...first,
    attributions: mergedAttributions(group),
    ...mergedBounds(group),
    ...mergedCap(group),
    minZoom: mergedBound(
      group.map((layer) => layer.minZoom),
      Math.min,
    ),
    name: mergedName(group),
    opacity: mergedBound(
      group.map((layer) => layer.opacity),
      Math.max,
    ),
  }
}
