import { formError, nameSchema, stringToIntOptional, stringToNumberOptional } from '$lib/forms/schemas'
import z from 'zod'

/**
 * A WMS overlay as it is stored: a bare endpoint plus the request parameters that select the layer.
 * `type` is a forward-compatibility marker for a second kind of overlay, nothing reads it yet.
 */
const storedMapLayerSchema = z.object({
  attributions: z.array(z.string()).nullish(),
  minZoom: z.number().nullish(),
  name: z.string(),
  opacity: z.number().nullish(),
  params: z.record(z.string(), z.string()).nullish(),
  type: z.literal('wms'),
  url: z.string(),
})

/**
 * A region's `settings` jsonb blob. The column is untyped at the database, so this is parsed where
 * the row enters the app (see `toRegionMembership`) rather than trusted.
 */
export const regionSettingsSchema = z.object({
  mapLayers: z.array(storedMapLayerSchema).default([]),
})

export type MapLayer = RegionSettings['mapLayers'][number]

export type RegionSettings = z.infer<typeof regionSettingsSchema>

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
export const mapLayerSchema = z
  .object({
    // One credit per line rather than a repeatable field inside a repeatable field: a layer
    // routinely carries several (data owner, survey office, source list), and they are edited
    // together far more often than one at a time.
    attributions: z.string().optional(),
    minZoom: stringToIntOptional.pipe(
      z
        .int()
        .min(0, { error: formError('form_numInvalid') })
        .max(28, { error: formError('form_numInvalid') })
        .optional(),
    ),
    name: nameSchema,
    opacity: stringToNumberOptional.pipe(
      z
        .number()
        .min(0, { error: formError('form_numInvalid') })
        .max(1, { error: formError('form_numInvalid') })
        .optional(),
    ),
    url: wmsUrl,
  })
  .transform(({ attributions, minZoom, name, opacity, url }): MapLayer => {
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
  })

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
