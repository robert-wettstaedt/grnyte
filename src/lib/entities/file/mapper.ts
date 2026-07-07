import type { MediaFile } from './dto'

/** Structural input so both route files and nested ascent files map through it. */
interface FileRow {
  id: string
  path: string
  width: number | null
  height: number | null
  bunnyStreamFk: string | null
}

export function toMediaFile(row: FileRow): MediaFile {
  return {
    id: row.id,
    path: row.path,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    bunnyStreamFk: row.bunnyStreamFk ?? undefined,
  }
}
