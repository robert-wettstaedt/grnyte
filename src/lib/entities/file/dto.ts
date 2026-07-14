import type { AscentType } from '$lib/entities/ascent/dto'

/**
 * A displayable media file. Discriminate on `bunnyStreamFk` before treating
 * `path` as a storage location: video rows have `path === ''` and their bytes
 * live at Bunny Stream under that GUID.
 */
export interface MediaFile {
  id: string
  path: string
  /** EXIF-oriented pixel size of the original image; aspect ratio only. */
  width: number | undefined
  height: number | undefined
  /** Bunny Stream video GUID; `undefined` means the row is an image. */
  bunnyStreamFk: string | undefined
  /** Epoch millis of upload; the media grid sorts by this. */
  createdAt: number
  /** Region the file lives in; drives the viewer's edit/delete permission checks. */
  regionFk: number
  /** Private unless EXPLICITLY 'public': `undefined`/NULL (the default on every row) is private. */
  visibility: 'public' | 'private' | undefined
  /** The owning ascent's creator when the file hangs on an ascent; lets the client
   *  mirror the own-ascent-media RLS grants (see entities/file/permissions.ts). */
  ascentCreatedBy: number | undefined
  /** Origin URL of a Bunny video (credited in the viewer); `undefined` otherwise. */
  source: string | undefined
  /** Who uploaded the file (`createdBy` → users); `undefined` if the query omits the relation. */
  uploader: { id: number; username: string } | undefined
  /** Set when the file hangs on an ascent (stamped by the ascent mapper): lets thumbnails
   *  badge the climber and the viewer caption/detail-sheet the ascent it belongs to. */
  ascent?: {
    id: number
    type: AscentType
    dateTime: number | undefined
    notes: string
    gradeFk: number | undefined
    rating: number | undefined
    temperature: number | undefined
    humidity: number | undefined
  }
}
