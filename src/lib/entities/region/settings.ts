import { fingerprint } from '$lib/forms/fingerprint'
import { formError, nameSchema, stringToIntOptional, stringToNumberOptional } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { DEFAULT_TAGS } from './tagVocabulary'

/**
 * A WMS overlay as stored: a bare endpoint plus the parameters that select the layer.
 *
 * Two schemas over one shape: a loose parse decides what the map draws (an unknown key is dropped
 * and the layer still shows), a strict one decides only whether the editor may write it back.
 */
const mapLayerShape = {
  attributions: z.nullish(z.array(z.string())),
  minZoom: z.nullish(z.number()),
  name: z.string(),
  opacity: z.nullish(z.number()),
  params: z.nullish(z.record(z.string(), z.string())),
  type: z.literal('wms'),
  url: z.string(),
}

/** Reading, which is deliberately forgiving: an unknown key is dropped and the layer still draws. */
const storedMapLayerSchema = z.object(mapLayerShape)

/** The same shape, but rejecting a layer carrying anything else. Only ever used to answer whether
 *  a layer can be written BACK, never to decide what the map draws. */
const exactMapLayerSchema = z.strictObject(mapLayerShape)

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
 * carries none of that function's forever-compatibility duty.
 */
export function mapLayerKey(layer: MapLayer): string {
  // Plain comparison, not `localeCompare`, for the reason `fingerprint` gives.
  const params = Object.entries(layer.params ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return JSON.stringify([layer.url, params])
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
      // Plain comparison, not `localeCompare`, for the reason `fingerprint` gives.
      layer.params == null ? null : Object.entries(layer.params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ]),
  )

  return `${layers.length}-${fingerprint(canonical)}`
}

/**
 * Layers from every region the user belongs to, with an overlay stored in more than one region
 * collapsed into one. Drawing it twice means double the tile requests and a compounded opacity.
 *
 * Merged most-permissive, so nobody loses visibility they had in a region on its own. Order is
 * each group's FIRST occurrence: a member of two regions then sees the earlier region's stacking
 * unchanged.
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

/** How a pasted URL and a stored endpoint convert into each other. Validating and splitting are
 *  one parse, so an unchecked string cannot reach the conversion. */
export const wmsUrl = z.codec(
  z.string({ error: formError('form_required') }),
  z.object({ params: z.record(z.string(), z.string()), url: z.string() }),
  {
    decode: (value, payload) => {
      const parsed = parseWmsUrl(value)

      if (parsed == null) {
        payload.issues.push({ code: 'custom', input: value, message: formError('form_wmsUrlInvalid') })
        return z.NEVER
      }

      return parsed
    },
    encode: ({ params, url }) => formatWmsUrl(params, url),
  },
)

/** One layer as the settings form submits it. Edited as a single pasted URL because remote-form
 *  field paths cannot express a record's dynamic keys. */
export const mapLayerSchema = z.pipe(
  z.object({
    // One credit per line, rather than a repeatable field inside a repeatable field.
    attributions: z.optional(z.string()),
    minZoom: z.pipe(
      stringToIntOptional,
      z.optional(
        z
          .int()
          .check(z.gte(0, { error: formError('form_numInvalid') }), z.lte(28, { error: formError('form_numInvalid') })),
      ),
    ),
    name: nameSchema,
    opacity: z.pipe(
      stringToNumberOptional,
      z.optional(
        z
          .number()
          .check(z.gte(0, { error: formError('form_numInvalid') }), z.lte(1, { error: formError('form_numInvalid') })),
      ),
    ),
    url: wmsUrl,
  }),
  z.transform(({ attributions, minZoom, name, opacity, url }): MapLayer => {
    const credits = (attributions ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    return {
      attributions: credits.length === 0 ? null : credits,
      minZoom: minZoom ?? null,
      name,
      opacity: opacity ?? null,
      params: url.params,
      type: 'wms',
      url: url.url,
    }
  }),
)

/** The inverse of {@link mapLayerSchema}, to seed the form from a stored layer. An absent value is
 *  the empty string, which is what the field codecs decode back to absent. */
export function toLayerForm(layer: MapLayer): z.input<typeof mapLayerSchema> {
  return {
    attributions: layer.attributions?.join('\n') ?? '',
    minZoom: layer.minZoom == null ? '' : String(layer.minZoom),
    name: layer.name,
    opacity: layer.opacity == null ? '' : String(layer.opacity),
    url: formatWmsUrl(layer.params ?? {}, layer.url),
  }
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
    attributions: mergedAttributions(group),
    minZoom: mergedBound(
      group.map((layer) => layer.minZoom),
      Math.min,
    ),
    name: mergedName(group),
    opacity: mergedBound(
      group.map((layer) => layer.opacity),
      Math.max,
    ),
    params: first.params,
    type: 'wms',
    url: first.url,
  }
}
