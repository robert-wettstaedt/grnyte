import { z } from 'zod'

// Derive paraglide's per-message key + param types so server-side error payloads stay type-safe.
type Messages = (typeof import('$lib/paraglide/messages'))['m']
type MessageKey = keyof Messages
type ParamsOf<K extends MessageKey> = Parameters<Messages[K]>[0]

/** Build a locale-agnostic zod error payload that FormHint resolves via paraglide `m[key](params)`. */
export function formError<K extends MessageKey>(
  key: K,
  ...params: keyof ParamsOf<K> extends never ? [] : [params: ParamsOf<K>]
): string {
  return JSON.stringify({ message: key, params: params[0] })
}

export const stringToInt = z.codec(
  z.string({ error: formError('form_required') }).regex(z.regexes.integer, formError('form_numInvalid')),
  z.int(),
  {
    decode: (str) => Number.parseInt(str, 10),
    encode: (num) => num.toString(),
  },
)

export const stringToIntOptional = z.codec(
  z
    .union([
      z.literal(''),
      z.string({ error: formError('form_required') }).regex(z.regexes.integer, formError('form_numInvalid')),
    ])
    .optional(),
  z.int().optional(),
  {
    decode: (str) => (str == null || str === '' ? undefined : Number.parseInt(str, 10)),
    encode: (num) => (num == null ? '' : num.toString()),
  },
)

export const stringToNumber = z.codec(
  z.string({ error: formError('form_required') }).regex(z.regexes.number, formError('form_numInvalid')),
  z.number(),
  {
    decode: (str) => Number.parseFloat(str),
    encode: (num) => num.toString(),
  },
)

export const stringToNumberOptional = z.codec(
  z
    .union([
      z.literal(''),
      z.string({ error: formError('form_required') }).regex(z.regexes.number, formError('form_numInvalid')),
    ])
    .optional(),
  z.number().optional(),
  {
    decode: (str) => (str == null || str === '' ? undefined : Number.parseFloat(str)),
    encode: (num) => (num == null ? '' : num.toString()),
  },
)

export const regionSettingsSchema = z.object({
  mapLayers: z
    .array(
      z.object({
        attributions: z.array(z.string()).nullish(),
        minZoom: z.number().nullish(),
        name: z.string(),
        opacity: z.number().nullish(),
        params: z.record(z.string(), z.string()).nullish(),
        type: z.literal('wms'),
        url: z.string(),
      }),
    )
    .default([]),
})
export type RegionSettings = z.infer<typeof regionSettingsSchema>
