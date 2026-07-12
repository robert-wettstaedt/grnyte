import type { MediaFile } from './dto'

/** Structural input so both route files and nested ascent files map through it. */
interface FileRow {
  id: string
  path: string
  width: number | null
  height: number | null
  bunnyStreamFk: string | null
  /** Nullable in the Zero row (DB default), never null in practice; coerced below. */
  createdAt: number | null
  regionFk: number
  visibility: 'public' | 'private' | null
  /** Present when the query `.related('bunnyStream')`; cardinality-one → single row. */
  bunnyStream?: { source: string | null } | null
  /** Present when the query `.related('author')`; cardinality-one → single row. */
  author?: { id: number; username: string } | null
}

/** `ascentCreatedBy` is deliberately NOT a parameter: it feeds permission checks, and an
 *  optional second param made `rows.map(toMediaFile)` silently pass the array INDEX as the
 *  owner (own-media grants leaked to whichever user's id matched a file's position). The
 *  ascent mapper stamps it onto the returned object instead. */
export function toMediaFile(row: FileRow): MediaFile {
  return {
    id: row.id,
    path: row.path,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    bunnyStreamFk: row.bunnyStreamFk ?? undefined,
    createdAt: row.createdAt ?? 0,
    regionFk: row.regionFk,
    visibility: row.visibility ?? undefined,
    source: row.bunnyStream?.source ?? undefined,
    uploader: row.author ? { id: row.author.id, username: row.author.username } : undefined,
    ascentCreatedBy: undefined,
  }
}
