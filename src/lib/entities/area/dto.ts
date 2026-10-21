import type { Area } from '$lib/db/schema'
import type { DisplayName } from '$lib/entities/displayName'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import {
  boundedDegrees,
  coordinate,
  formError,
  intFromString,
  stringToInt,
  stringToIntOptional,
} from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

export interface AreaDetail extends AreaListItem {
  createdAt: Date | undefined
  /** Null once the author deleted their account. */
  createdBy: null | number
  description: string
  geoPaths: string[]
  /** The stored parent, which a delete leaves for; absent on a top-level area. */
  parentFk: number | undefined
  parkingLocations: Geolocation[]
  regionFk: number
}

export interface AreaListItem {
  areas: AreaListItem[]
  id: number
  /** From `toDisplayName`, so it is never blank. A plain string will not assign here. */
  name: DisplayName
  type: 'area' | 'sector' | null
}

export const areaActionSchema = z.object({
  description: z._default(z.optional(z.string()), ''),
  id: z.optional(stringToInt),
  name: z
    .string({ error: formError('form_required') })
    .check(z.trim(), z.minLength(3, { error: formError('form_charsMin', { count: 3 }) })),
  // For `parentFk`, `stringToIntOptional` and not `z.optional(stringToInt)`. The latter admits
  // `undefined` and nothing else, while a top-level area's hidden `parentFk` submits an EMPTY
  // STRING. That was refused with `form_numInvalid` on a field the edit form does not render, so
  // Save did nothing and said nothing. "No parent" and "field absent" are the same thing here, and
  // both spell '' in a form. `id` above is the other case and is fine as it stands: the form omits
  // it entirely on a create rather than submitting it blank.
  parentFk: stringToIntOptional,
  // Not `stringToInt`: this renders as a `<select>`, and its generic "enter a valid number" was
  // being shown to somebody whose only available action is to pick one.
  regionFk: intFromString(formError('areas_regionRequired')),
})

/** Field shape the shared area form (`AreaFormFields`) binds to: same for create and edit. */
export type AreaFormInput = z.input<typeof areaActionSchema>

export const restoreAreaSchema = z.discriminatedUnion('mode', [
  z.object({
    area: z.object({
      description: z.optional(z.nullable(z.string())),
      geoPaths: z.optional(z.nullable(z.array(z.string()))),
      name: z.string(),
      parentFk: z.optional(z.nullable(z.number())),
      regionFk: z.number(),
      walkingPaths: z.optional(z.nullable(z.array(z.string()))),
    }),
    areaId: z.number(),
    mode: z.literal('hard'),
    // Bounded like every other coordinate this app accepts (`coordinate(90)` on `addParking`).
    // `geolocations` has no CHECK constraint, so an unbounded snapshot was the one door that could
    // store a parking at lat 999 and drag every map that fits its markers along with it.
    parking: z.array(z.object({ lat: boundedDegrees(90), long: boundedDegrees(180) })),
  }),
  // No `deletedAt` to accept: the restore reads it off the stored area, not the client (see `softRestoreArea`).
  z.object({ areaId: z.number(), mode: z.literal('soft') }),
])

/** Snapshot `deleteArea` returns so `restoreArea` can undo either delete path. */
export type DeleteAreaSnapshot =
  | {
      // No `type`: it is derived state (`refreshAreaType`), so the restore recomputes it rather than
      // trusting a value that has been through the client. A hard delete only ever runs on an area
      // with no blocks and no sub-areas, which is exactly the state that derives to `null` anyway.
      area: Pick<Area, 'description' | 'geoPaths' | 'name' | 'parentFk' | 'regionFk' | 'walkingPaths'>
      areaId: number
      mode: 'hard'
      parking: { lat: number; long: number }[]
    }
  // No `deletedAt`: read off the stored row rather than accepted from the client (see `softRestoreArea`).
  | { areaId: number; mode: 'soft' }

export const addParkingSchema = z.object({
  areaId: stringToInt,
  lat: coordinate(90),
  long: coordinate(180),
  path: z.optional(z.string()),
})

/** What `deleteParking` answers and `restoreParking` takes back. */
export const restoreParkingSchema = z.object({
  areaId: z.number(),
  lat: boundedDegrees(90),
  long: boundedDegrees(180),
  path: z.optional(z.string()),
})
