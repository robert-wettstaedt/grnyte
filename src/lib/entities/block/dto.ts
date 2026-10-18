import type { Block } from '$lib/db/schema'
import type { AreaListItem } from '$lib/entities/area/dto'
import type { DisplayName } from '$lib/entities/displayName'
import type { Geolocation } from '$lib/entities/geolocation/dto'
import { boundedDegrees, optionalCoordinate, stringToInt } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

export type BlockDetail = BlockListItem & {
  /** The stored parent, which a delete leaves for: never read off the `areas` trail, which may lag. */
  areaFk: number
  createdAt: Date | undefined
  createdBy: number
  /** Markdown, with entity references and user mentions. '' when unset, never null. */
  description: string
  geolocation: Geolocation | undefined
  /** The stored name as typed: empty for auto-numbered blocks. `name` is the display
   *  fallback ("Block 2"); editing must prefill from this so a blank block stays blank. */
  rawName: string
  /** One entry per topo image, in topo order: the `topos` row id (links to the
   *  topo page), `files.path` plus the stored EXIF-oriented pixel size (missing
   *  for files not yet backfilled). */
  topoImages: { height?: number; id: number; path: string; width?: number }[]
}

export type BlockListItem = {
  areas: AreaListItem[]
  id: number
  /** From `blockName`, so it is never blank: "Block 3" when the block has no name of its own. */
  name: DisplayName
  order: number
  regionFk: number
}

export const blockActionSchema = z.object({
  areaId: stringToInt,
  description: z._default(z.optional(z.string()), ''),
  // Checkbox-style hidden input: "true" when the pin is a rough guess, absent otherwise.
  estimated: z.pipe(
    z.optional(z.string()),
    z.transform((value) => value === 'true'),
  ),
  id: z.optional(stringToInt),
  /** Fingerprint of the pin the form loaded. Defaulted, not optional: '' never equals a real one,
   *  so a client that sends none is refused. `createBlock` shares this schema and ignores it. */
  known: z._default(z.optional(z.string()), ''),
  lat: optionalCoordinate(90),
  long: optionalCoordinate(180),
  name: z._default(z.optional(z.string().check(z.trim())), ''),
})

/** Field shape the shared add/edit-block form binds to: `id` is set only when editing. */
export type BlockFormInput = z.input<typeof blockActionSchema>

/** Coordinates aimed at one live block, the shape both pin-only commands take. */
export const blockPinSchema = z.object({ id: z.number(), lat: boundedDegrees(90), long: boundedDegrees(180) })

export const restoreBlockSchema = z.discriminatedUnion('mode', [
  z.object({
    areaFk: z.number(),
    block: z.object({
      description: z.nullable(z.string()),
      name: z.string(),
      order: z.number(),
      regionFk: z.number(),
    }),
    blockId: z.number(),
    // Bounded like every other coordinate this app accepts (`coordinate(90)` on the block form,
    // `estimateBlockLocationFromPhoto` on the command side). `geolocations` has no CHECK constraint,
    // so an unbounded snapshot was the one door that could park a block at lat 999.
    geolocation: z.nullable(z.object({ estimated: z.boolean(), lat: boundedDegrees(90), long: boundedDegrees(180) })),
    mode: z.literal('hard'),
  }),
  // No `deletedAt` to accept: the restore reads it off the stored block.
  z.object({ blockId: z.number(), mode: z.literal('soft') }),
])

/** Snapshot `deleteBlock` returns so `restoreBlock` can undo either delete path.
 *  The hard path carries `order` so the restore can slot the block back where it was. */
export type DeleteBlockSnapshot =
  | {
      areaFk: number
      block: Pick<Block, 'description' | 'name' | 'order' | 'regionFk'>
      blockId: number
      geolocation: null | { estimated: boolean; lat: number; long: number }
      mode: 'hard'
    }
  // No `deletedAt`: read off the stored block rather than accepted from the client (see `softRestoreBlock`).
  | { blockId: number; mode: 'soft' }

/** What the reorder screen submits: the ids it could see, top to bottom. */
export const reorderBlocksSchema = z.object({ areaId: z.number(), orderedIds: z.array(z.number()) })
