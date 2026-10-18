import type { Route } from '$lib/db/schema'
import type { DisplayName } from '$lib/entities/displayName'
import type { TopoPoint } from '$lib/entities/topo/dto'
import { formError, stringToInt, stringToIntOptional } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

const faClimberSchema = z.object({
  name: z
    .string({ error: formError('form_required') })
    .check(z.trim(), z.minLength(1, { error: formError('form_required') })),
  userFk: stringToIntOptional,
})

/** The add/edit-route form's fields. Shared with the `routes.update` mutator, which validates them
 *  on both client and server. */
export const routeActionSchema = z.object({
  blockId: stringToInt,
  description: z._default(z.optional(z.string()), ''),
  firstAscensionists: z._default(z.optional(z.array(faClimberSchema)), []),
  firstAscentYear: z.pipe(
    stringToIntOptional,
    z.optional(z.int().check(z.gte(1900, formError('form_numInvalid')), z.lte(2100, formError('form_numInvalid')))),
  ),
  gradeFk: stringToIntOptional,
  id: stringToIntOptional,
  /** Fingerprint of the tags and first ascensionists the form loaded. Optional because
   *  `createRoute` shares this schema and replaces nothing; `updateRoute` insists on it. */
  known: z.optional(z.string()),
  name: z._default(z.optional(z.string().check(z.trim())), ''),
  // 1–3 stars; the field is absent when unrated (0 stars → no rating, not "0 stars").
  rating: z.pipe(stringToIntOptional, z.optional(z.int().check(z.gte(1), z.lte(3)))),
  tags: z._default(z.optional(z.array(z.string())), []),
})

/** What `restoreRoute` accepts. Placement and authorship are never in it: they come from the block. */
export const restoreRouteSchema = z.discriminatedUnion('mode', [
  z.object({
    firstAscensionistFks: z.array(z.number()),
    mode: z.literal('hard'),
    route: z.object({
      blockFk: z.number(),
      description: z.nullable(z.string()),
      // Bounded exactly as `routeActionSchema` bounds them: the snapshot round-trips through the
      // client, `routes` has no CHECK on either column, and `rating` feeds `recalcUserGradeAndRating`.
      firstAscentYear: z.nullable(z.int().check(z.gte(1900), z.lte(2100))),
      gradeFk: z.nullable(z.number()),
      name: z.string(),
      // 1-3 stars, as on the form; unrated is null rather than 0.
      rating: z.nullable(z.int().check(z.gte(1), z.lte(3))),
    }),
    routeId: z.number(),
    tags: z.array(z.string()),
  }),
  z.object({ mode: z.literal('soft'), routeId: z.number() }),
])

/** Snapshot `deleteRoute` returns so `restoreRoute` can undo either delete path. */
export type DeleteRouteSnapshot =
  | {
      firstAscensionistFks: number[]
      mode: 'hard'
      route: Pick<Route, 'blockFk' | 'description' | 'firstAscentYear' | 'gradeFk' | 'name' | 'rating'>
      routeId: number
      tags: string[]
    }
  | { mode: 'soft'; routeId: number }

export type RouteDetail = RouteListItem & {
  /** The route's first ascensionists, for the edit form's picker. */
  firstAscents: { name: string; userFk: number | undefined }[]
  /** The grade/rating stored on the route itself (the breakdown's "original grade");
   *  the edit form prefills from these, never from the community values. */
  rawGradeFk: number | undefined
  /** The stored name as typed, empty for unnamed routes. `name` is the display
   *  fallback (`common_unnamed`); editing must prefill from this so a blank route stays blank. */
  rawName: string
  rawRating: number
  regionFk: number
}
/** Field shape the shared add/edit-route form binds to, `id` is set only when editing. */
export type RouteFormInput = z.input<typeof routeActionSchema>

export type RouteFormValue = z.output<typeof routeActionSchema>

export interface RouteListItem {
  /** Name of the route's area, for a breadcrumb (search results). */
  areaName?: DisplayName
  blockFk: number
  /** Name of the route's block, for a breadcrumb (search results). */
  blockName?: DisplayName
  createdAt: Date | undefined
  createdBy: number
  description: string
  firstAscentYear: number | undefined
  /** Community grade (`userGradeFk`): the route's own grade averaged with one vote per
   *  user, their latest ascent. This is THE displayed grade; the stored original only
   *  surfaces via {@link RouteDetail.rawGradeFk}. */
  gradeFk: number | undefined
  id: number
  /** From `toDisplayName`, so it is never blank. `rawName` below is the stored string. */
  name: DisplayName
  /** Community rating (`userRating`), same one-vote-per-user rule as the grade. */
  rating: number
  /** The stored name as typed, empty for unnamed routes (`name` is the `common_unnamed`
   *  display fallback). Search scores against this so an unnamed route can't match
   *  the placeholder text. */
  rawName?: string
  /** The route's region: drives the permission gates, and a region breadcrumb when a
   *  search spans more than one. */
  regionFk: number
  tags: string[]
  /** Stored dimensions of that image, so its box can be held before the topos load. */
  topoImageHeight?: number
  /** `files.path` of the route's best topo image, if it's drawn on one. */
  topoImagePath?: string
  topoImageWidth?: number
  /** The route's line points on that topo. */
  topoPoints?: TopoPoint[]
}

/** The map's per-route data: just what the donut counts and Filter need. */
export interface RouteMapItem {
  blockFk: null | number
  /** Community grade (`userGradeFk`), like {@link RouteListItem.gradeFk}. */
  gradeFk: number | undefined
  id: number
}
