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

/** `ascentCreatedBy`: the parent ascent's creator, passed by the ascent mapper for
 *  files reached through an ascent; files attached to other entities leave it unset. */
export function toMediaFile(row: FileRow, ascentCreatedBy?: number): MediaFile {
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
    ascentCreatedBy,
  }
}
