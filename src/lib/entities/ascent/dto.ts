import type { DisplayName } from '$lib/entities/displayName'
import type { MediaFile } from '$lib/entities/file/dto'
import { formError, stringToInt, stringToIntOptional } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

/** Full ascent shape for the edit form. */
export interface AscentDetail extends Omit<RouteAscent, 'authorName'> {
  routeFk: number
}

export type AscentType = 'attempt' | 'flash' | 'redpoint' | 'repeat'

/** One ascent of a route: the climber's take on it and any attached media. */
export interface RouteAscent {
  /** The climber's username; empty while the author row hasn't synced. */
  authorName: string
  createdBy: number
  /** Epoch millis (Zero maps the pg `date` column to a number). */
  dateTime: number | undefined
  files: MediaFile[]
  gradeFk: number | undefined
  humidity: number | undefined
  id: number
  notes: string
  rating: number | undefined
  regionFk: number
  temperature: number | undefined
  type: AscentType
}

/** Minimal ascent shape used to derive a user's ascent status per route. */
export interface UserAscent {
  routeFk: number
  type: AscentType
}

/** A user's ascent enriched with its route's name and community grade: the
 *  profile page's sessions, stats and grade histogram all derive from these. */
export interface UserAscentDetail extends RouteAscent {
  /** The route's area name, for the logbook row's location breadcrumb. */
  areaName?: DisplayName
  /** The route's block name (auto-numbered fallback applied), for the breadcrumb. */
  blockName?: DisplayName
  routeFk: number
  /** The route's community grade (`userGradeFk`): what the grade histogram buckets by. */
  routeGradeFk: number | undefined
  routeName: string
}

/** The add/edit-ascent form's fields, shared by the remote forms and the `ascents` mutators. */
export const ascentActionSchema = z.object({
  dateTime: z.iso.date({ error: formError('form_required') }),
  gradeFk: stringToIntOptional,
  humidity: z.pipe(
    stringToIntOptional,
    z.optional(z.int().check(z.gte(0, formError('form_numInvalid')), z.lte(100, formError('form_numInvalid')))),
  ),
  id: stringToIntOptional,
  notes: z._default(z.optional(z.string()), ''),
  // 1–3 stars; the field is absent when unrated (same convention as the route form).
  rating: z.pipe(stringToIntOptional, z.optional(z.int().check(z.gte(1), z.lte(3)))),
  routeId: stringToInt,
  temperature: z.pipe(
    stringToIntOptional,
    z.optional(z.int().check(z.gte(-30, formError('form_numInvalid')), z.lte(50, formError('form_numInvalid')))),
  ),
  // Not `ascentTypeEnum`: a value import from the drizzle schema would ship it to the client.
  type: z.enum(['flash', 'redpoint', 'repeat', 'attempt'] satisfies AscentType[], {
    error: formError('form_required'),
  }),
})

/** Field shape the shared add/edit-ascent form binds to, `id` is set only when editing. */
export type AscentFormInput = z.input<typeof ascentActionSchema>

export type AscentFormValue = z.output<typeof ascentActionSchema>
