import { fileIdSchema } from '$lib/entities/file/dto'
import * as z from '$lib/forms/zod'

export interface TopoLine {
  gradeFk: number | undefined
  /** `topo_routes` row id. */
  id: number
  name: string
  points: TopoPoint[]
  routeId: number
  topType: 'top' | 'topout'
}

/** One parsed point of a topo line, in its stored coordinate space (0–1 fractions or legacy pixels). */
export interface TopoPoint {
  id: string
  type: 'middle' | 'start' | 'top'
  x: number
  y: number
}

export interface TopoView {
  /** Who uploaded the photo. */
  createdBy?: number
  /** `topos` row id. */
  id: number
  /** Stored EXIF-oriented pixel height; see {@link TopoView.imageWidth}. */
  imageHeight?: number
  /** `files.path` for the topo image, fed to the `Image` component. */
  imagePath: string
  /** Stored EXIF-oriented pixel width of the topo image: lets the viewer size its
   *  box and overlay before the photo loads. Missing for files not yet backfilled. */
  imageWidth?: number
  lines: TopoLine[]
}

export const createTopoSchema = z.object({ blockId: z.number(), fileId: fileIdSchema })

export const replaceTopoImageSchema = z.object({ fileId: fileIdSchema, topoId: z.number() })

export const reorderToposSchema = z.object({ blockId: z.number(), orderedIds: z.array(z.number()) })

const topoLineSchema = z.object({
  // `M x,y L x,y … Z`, and nothing else. The feed encodes a set of these into one string
  // and slices it back apart on the separators, so a path holding one would re-slice the
  // entry it sits in; `convertPathToPoints` reads no other notation either.
  path: z.string().check(z.regex(/^[mlz0-9.,\- ]*$/i, 'Unsupported path notation')),
  routeFk: z.number(),
  // Not `topoRouteTopTypeEnum`: a value import from the drizzle schema would ship it to the client.
  topType: z.enum(['top', 'topout'] satisfies TopoLine['topType'][]),
})

export const saveTopoLinesSchema = z.object({
  /** Fingerprint of the lines the editor loaded. Defaulted, not optional: '' never equals a
   *  real fingerprint, so a client that sends none is refused. */
  known: z._default(z.optional(z.string()), ''),
  lines: z.array(topoLineSchema),
  topoId: z.number(),
})
