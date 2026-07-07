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
}
