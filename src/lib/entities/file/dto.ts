import type { AscentType } from '$lib/entities/ascent/dto'

/**
 * A displayable media file. Discriminate on `bunnyStreamFk` before treating
 * `path` as a storage location: video rows have `path === ''` and their bytes
 * live at Bunny Stream under that GUID.
 */
export interface MediaFile {
  /** Set when the file hangs on an ascent (stamped by the ascent mapper): lets thumbnails
   *  badge the climber and the viewer caption/detail-sheet the ascent it belongs to. */
  ascent?: {
    dateTime: number | undefined
    gradeFk: number | undefined
    humidity: number | undefined
    id: number
    notes: string
    rating: number | undefined
    temperature: number | undefined
    type: AscentType
  }
  /** The owning ascent's creator when the file hangs on an ascent; lets the client
   *  mirror the own-ascent-media RLS grants (see entities/file/permissions.ts). */
  ascentCreatedBy: number | undefined
  /** Bunny Stream video GUID; `undefined` means the row is an image. */
  bunnyStreamFk: string | undefined
  /** Epoch millis of upload; the media grid sorts by this. */
  createdAt: number
  height: number | undefined
  id: string
  path: string
  /** Region the file lives in; drives the viewer's edit/delete permission checks. */
  regionFk: number
  /** The route this file belongs to (directly, or via its ascent). Populated by the
   *  `/f/<id>` share page so the viewer caption can show route name/grade/rating out of
   *  context; unset (and unrendered) in the in-app viewer, which already has that context. */
  route?: {
    gradeFk: number | undefined
    id: number
    name: string
    rating: number | undefined
  }
  /** Origin URL of a Bunny video (credited in the viewer); `undefined` otherwise. */
  source: string | undefined
  /** Who uploaded the file (`createdBy` → users); `undefined` if the query omits the relation. */
  uploader: undefined | { id: number; username: string }
  /** Private unless EXPLICITLY 'public': `undefined`/NULL (the default on every row) is private. */
  visibility: 'private' | 'public' | undefined
  /** EXIF-oriented pixel size of the original image; aspect ratio only. */
  width: number | undefined
}

/**
 * Which word a file is: the one test, so the sentence a removal STORES and the sentence a feed
 * card SAYS can never disagree about the same row.
 */
export function mediaWord(file: { bunnyStreamFk: null | string | undefined }): 'photo' | 'video' {
  return file.bunnyStreamFk == null ? 'photo' : 'video'
}
