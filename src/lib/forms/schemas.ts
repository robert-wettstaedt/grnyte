import type { AuthError } from '@supabase/supabase-js'
import { z } from 'zod'

type MessageKey = keyof Messages
// Derive paraglide's per-message key + param types so server-side error payloads stay type-safe.
type Messages = (typeof import('$lib/paraglide/messages'))['m']
type ParamsOf<K extends MessageKey> = Parameters<Messages[K]>[0]

/** Build a locale-agnostic zod error payload that FormHint resolves via paraglide `m[key](params)`. */
export function formError<K extends MessageKey>(
  key: K,
  ...params: keyof ParamsOf<K> extends never ? [] : [params: ParamsOf<K>]
): string {
  return JSON.stringify({ message: key, params: params[0] })
}

/** Supabase's stable error codes mapped onto our copy. Everything else gets the generic key. */
const authErrorKeys = {
  email_address_invalid: 'auth_emailInvalid',
  email_exists: 'auth_emailTaken',
  email_not_confirmed: 'auth_emailNotConfirmed',
  invalid_credentials: 'auth_invalidCredentials',
  otp_expired: 'auth_resetLinkInvalid',
  over_email_send_rate_limit: 'auth_rateLimited',
  over_request_rate_limit: 'auth_rateLimited',
  same_password: 'auth_passwordSame',
  user_already_exists: 'auth_emailTaken',
  validation_failed: 'auth_emailInvalid',
  weak_password: 'auth_passwordWeak',
} as const satisfies Record<string, MessageKey>

/**
 * Turn a Supabase auth failure into a `formError` payload. Supabase only speaks English, so its
 * `message` cannot go in front of a user; its `code` is the stable part and the only thing worth
 * mapping. The unmapped tail is mostly infrastructure trouble (mailer down, provider outage) that
 * reads the same to the user whatever we call it, so it collapses into one generic message.
 */
export function authError(error: AuthError): string {
  return formError(authErrorKeys[error.code as keyof typeof authErrorKeys] ?? 'auth_unexpectedError')
}

/**
 * A display name. The character set is the one an `@mention` token can carry, so a username is
 * always writable as a mention. Uniqueness is deliberately NOT global: usernames are display-only
 * (profiles are keyed by id, mentions store ids), and a global check would deny a name over a
 * collision the two users could never see, while leaking that the name exists in a private region.
 * Callers that have a region scope check for collisions there instead.
 */
export const usernameSchema = z
  .string({ error: formError('form_required') })
  .trim()
  .min(3, { error: formError('form_charsMin', { count: 3 }) })
  .max(39, { error: formError('form_charsMax', { count: 39 }) })
  .regex(/^[\da-zA-Z][-\da-zA-Z_]*$/, { error: formError('auth_usernameInvalid') })

/** The display name of an entity a user creates (area, region, ...). Trimmed, and long enough
 *  to be recognisable in a list. */
export const nameSchema = z
  .string({ error: formError('form_required') })
  .trim()
  .min(3, { error: formError('form_charsMin', { count: 3 }) })

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

/**
 * Decimal degrees bounded to ±`limit` (90 for latitude, 180 for longitude).
 *
 * Exported rather than private because the undo snapshots need the bound WITHOUT the string codec
 * `coordinate` wraps it in: they carry real numbers, having been JSON round-tripped instead of
 * submitted as form fields. `geolocations` has no CHECK constraint, so this is the only thing
 * between a hand-built snapshot and a pin at lat 999 dragging every map that fits its markers.
 * One definition, so a new coordinate path is a missing import rather than a silent gap.
 */
/**
 * A user-authored text field as it should be STORED: the text, or NULL when there is nothing
 * in it.
 *
 * Trimmed rather than length-checked, because the two sources disagree about empty. A plain
 * input submits an empty string, while the markdown editor reserialises an emptied document
 * with a trailing newline, which is not empty. Store both as NULL so `description IS NULL`
 * means "not set" and no reader has to know about a second empty. See `changed` in
 * event.server.ts, which normalises the same two shapes on the way into the feed.
 */
export const blank = (value: string): null | string => (value.trim().length === 0 ? null : value)

export const boundedDegrees = (limit: number) =>
  z
    .number()
    .min(-limit, { error: formError('form_numInvalid') })
    .max(limit, { error: formError('form_numInvalid') })

/** A required decimal-degree coordinate field. */
export const coordinate = (limit: number) => stringToNumber.pipe(boundedDegrees(limit))

/** Like `coordinate`, but the field may be omitted (empty string → undefined). */
export const optionalCoordinate = (limit: number) => stringToNumberOptional.pipe(boundedDegrees(limit).optional())
