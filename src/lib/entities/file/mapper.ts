import type { MediaFile } from './dto'

/** What a file hangs off. Route beats ascent beats block beats area, and at most one is ever set. */
export type FileParent = { id: number; type: 'area' | 'ascent' | 'block' | 'route' }

/** Structural input so both route files and nested ascent files map through it. */
interface FileRow {
  /** Present when the query `.related('author')`; cardinality-one → single row. */
  author?: null | { id: number; username: string }
  /** Present when the query `.related('bunnyStream')`; cardinality-one → single row. */
  bunnyStream?: null | { source: null | string }
  bunnyStreamFk: null | string
  /** Nullable in the Zero row (DB default), never null in practice; coerced below. */
  createdAt: null | number
  height: null | number
  id: string
  path: string
  regionFk: number
  visibility: 'private' | 'public' | null
  width: null | number
}

/**
 * The one statement of that precedence.
 *
 * Read by BOTH sides and deliberately so: the delete path picks the event's object with it, and the
 * feed groups uploads on it. Two copies agreeing today is not the same as two copies agreeing, and
 * a divergence would land an upload card and its removal card on different locality keys, so the
 * reader sees them as unrelated.
 */
export function fileParent(file: {
  areaFk?: null | number
  ascentFk?: null | number
  blockFk?: null | number
  routeFk?: null | number
}): FileParent | undefined {
  if (file.routeFk != null) return { id: file.routeFk, type: 'route' }
  if (file.ascentFk != null) return { id: file.ascentFk, type: 'ascent' }
  if (file.blockFk != null) return { id: file.blockFk, type: 'block' }
  if (file.areaFk != null) return { id: file.areaFk, type: 'area' }
  return undefined
}

/** `ascentCreatedBy` is deliberately NOT a parameter: it feeds permission checks, and an
 *  optional second param made `rows.map(toMediaFile)` silently pass the array INDEX as the
 *  owner (own-media grants leaked to whichever user's id matched a file's position). The
 *  ascent mapper stamps it onto the returned object instead. */
export function toMediaFile(row: FileRow): MediaFile {
  return {
    ascentCreatedBy: undefined,
    bunnyStreamFk: row.bunnyStreamFk ?? undefined,
    createdAt: row.createdAt ?? 0,
    height: row.height ?? undefined,
    id: row.id,
    path: row.path,
    regionFk: row.regionFk,
    source: row.bunnyStream?.source ?? undefined,
    uploader: row.author ? { id: row.author.id, username: row.author.username } : undefined,
    visibility: row.visibility ?? undefined,
    width: row.width ?? undefined,
  }
}
