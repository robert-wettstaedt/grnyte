import { formError, nameSchema, stringToIntOptional, stringToNumberOptional } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { DEFAULT_TAGS } from './tagVocabulary'

/**
 * A WMS overlay as it is stored: a bare endpoint plus the request parameters that select the layer.
 * `type` is a forward-compatibility marker for a second kind of overlay, nothing reads it yet.
 *
 * Two schemas over one shape, because reading and writing back ask different questions. A plain
 * object strips a key it does not know and still reports success, which is fine for drawing the
 * layer and fatal for saving it: it would be written back without that key. So the loose parse
 * decides what the map gets, and the strict one decides only whether the editor may touch it.
 * Collapsing them into one strict parse dropped the layer from the map altogether, which is worse
 * than the problem it was closing. `type` only catches a new KIND of layer; the strict parse
 * catches a new field on the kind we have, which is the likelier way two builds diverge.
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
  // Deliberately `z.string()` rather than `tagNameSchema`: stored values were validated on the way
  // in, and re-validating on read would let one over-long tag fail the whole blob and take the
  // region's map layers down with it.
  // A factory because `DEFAULT_TAGS` is frozen and a `readonly string[]` does not satisfy the
  // value form. Not because `_default` shares an instance: it clones per parse. Kept as a factory
  // regardless, since it is the form that stays correct if either of those facts changes.
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
 * A fingerprint of the layers a form loaded, so a save can prove it is replacing what it read.
 *
 * A count cannot: delete one layer and add another and it is unchanged, so a stale form silently
 * resurrected the deleted one and destroyed the new one. Order and content both matter, so this is
 * a canonical rendering rather than a set.
 */
export function mapLayersFingerprint(layers: MapLayer[]): string {
  const canonical = JSON.stringify(
    layers.map((layer) => [
      layer.name,
      layer.type,
      layer.url,
      layer.attributions ?? null,
      layer.minZoom ?? null,
      layer.opacity ?? null,
      // Plain comparison, not `localeCompare`: this runs in the reader's browser and in Node, and
      // two collators disagreeing on one key pair would mean a permanent, unrecoverable stale
      // refusal on every save of that region.
      layer.params == null ? null : Object.entries(layer.params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ]),
  )

  // djb2. Not a security boundary, just a short stable value two readers of the same rows agree on.
  let hash = 5381
  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash * 33) ^ canonical.charCodeAt(index)) >>> 0
  }
  return `${layers.length}-${hash.toString(36)}`
}

/**
 * Read a region's `settings` column.
 *
 * Total by construction. The column is untyped jsonb, and this runs inside the auth hook and
 * inside a `$derived` over every membership, so a throw here is not one bad region: it is every
 * request by every member of it failing, the shell included.
 *
 * Per element, not per key. A region with three usable overlays and one this build does not
 * recognise keeps the three; dropping the array wholesale took the licence credits owed for them
 * with it, which is the outcome `$lib/map/attribution` exists to prevent.
 *
 * The `*Complete` flags are for screens that write a key BACK. What was dropped cannot be
 * represented, so saving what was read deletes the difference.
 */
export function readRegionSettings(raw: unknown): StoredSettings {
  // Not an object at all (an array, a scalar): nothing here round-trips, so no key is complete.
  // Reachable, because Postgres `'[]'::jsonb || '{...}'::jsonb` appends rather than merges.
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    // `[]` and not the defaults: `regionTags` is the allowlist a route write is checked against,
    // and `routes.remote` does not consult `tagsComplete`, so handing back seven tags this region
    // never defined would let every member store them on real routes.
    return { layersComplete: false, settings: unknownRegionSettings(), tagsComplete: false }
  }

  const blob = (raw ?? {}) as Record<string, unknown>
  const storedLayers = blob.mapLayers
  const layerList = Array.isArray(storedLayers) ? storedLayers : []
  const mapLayers = layerList.flatMap((layer) => {
    const parsed = storedMapLayerSchema.safeParse(layer)
    return parsed.success ? [parsed.data] : []
  })
  // Separately, and only for the flag: a layer that parsed loosely may still have lost a key on
  // the way through, and nothing downstream can tell, because `MapLayer` cannot represent one.
  const exact = layerList.every((layer) => exactMapLayerSchema.safeParse(layer).success)
  // Per element here too, for the reason the docstring gives: one unusable entry used to replace
  // the whole vocabulary with the defaults, and `regionTags` is the allowlist a route write is
  // checked against, so the region's real tags became unwritable.
  const storedTags = blob.tags
  const tagList = Array.isArray(storedTags) ? storedTags : []
  const readable = tagList.filter((tag) => typeof tag === 'string')

  return {
    layersComplete:
      (storedLayers === undefined || Array.isArray(storedLayers)) && mapLayers.length === layerList.length && exact,
    settings: {
      mapLayers,
      // Absent means nothing configured, so the defaults. Unreadable means unknown, so nothing:
      // `regionTags` is the allowlist a route write is checked against, and fabricating seven tags
      // for a region that never had them puts them in the picker and makes them writable.
      // Copied, never the module array itself: this runs in the auth hook for every membership on
      // every request and in a `$derived` over every membership on the client, so one `push`
      // downstream would rewrite the default vocabulary for the whole process.
      tags: storedTags === undefined ? [...DEFAULT_TAGS] : Array.isArray(storedTags) ? readable : [],
    },
    tagsComplete: storedTags === undefined || (Array.isArray(storedTags) && readable.length === tagList.length),
  }
}

/** A region nothing is known about: its row has not arrived, or its blob does not read. Distinct
 *  from {@link emptyRegionSettings} on purpose, because a save may overwrite "nothing configured"
 *  and must never overwrite "not known". Handing back the default vocabulary here also put
 *  seven tags the region may not use into the picker and into the route-write allowlist. */
export function unknownRegionSettings(): RegionSettings {
  return { mapLayers: [], tags: [] }
}

/**
 * Split a pasted request URL into the bare endpoint and its parameters. Returns null for anything
 * the map could not request tiles from: it has to be an absolute http(s) URL carrying the `LAYERS`
 * parameter that says which layer to draw. Everything beyond that (does the server answer, is the
 * layer named right) is only knowable by asking it, which is what the map does.
 *
 * Parameter names are uppercased on the way in. WMS declares them case-insensitive, but OpenLayers
 * reads `VERSION` and `LAYERS` off the record verbatim and merges the rest over its own uppercase
 * defaults, so a pasted `?layers=topo&version=1.1.1` would be sent alongside those defaults instead
 * of replacing them.
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

/**
 * The single definition of how a pasted URL and a stored endpoint convert into each other.
 * Validating and splitting are one parse, so there is no way to hand an unchecked string to the
 * conversion, and no way for the conversion to throw out of a form submission.
 */
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

/**
 * One layer as the settings form submits it, decoded straight into the shape that is stored. The
 * form edits a layer as a single pasted URL because remote-form field paths cannot express a
 * record's dynamic keys, and the URL an admin copies out of a capabilities document already carries
 * the parameters anyway.
 */
export const mapLayerSchema = z.pipe(
  z.object({
    // One credit per line rather than a repeatable field inside a repeatable field: a layer
    // routinely carries several (data owner, survey office, source list), and they are edited
    // together far more often than one at a time.
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
