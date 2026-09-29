import { resolve } from '$app/paths'
import { imageMimeOf } from '$lib/entities/file/upload'
import type { BlockDetail } from './dto'

/** How much is known about a block's location, as `LocationMeta` renders it. */
export type BlockPin = 'estimated' | 'missing' | 'set'

/** How a scan of freshly uploaded photos for a pin ended. `failed` means a read or a save went
 *  wrong, so the reader must not be told the photos carry no location. */
export type PhotoLocationOutcome = 'failed' | 'none' | 'saved'

/** Accepted upload types exifr's lite build has no parser for. It throws on them, but that is an
 *  absence of a location, not a failure. */
const EXIF_UNREADABLE_TYPES = new Set(['image/png', 'image/webp'])

export function blockPin(block: BlockDetail): BlockPin {
  if (block.geolocation == null) {
    return 'missing'
  }
  return block.geolocation.estimated ? 'estimated' : 'set'
}

/**
 * Where a viewer who may edit repairs the pin. Estimated goes to the edit form, not the move
 * picker: only its checkbox clears the flag. Shared so the block and route pages cannot disagree.
 */
export function blockRepairHref(block: BlockDetail, canEdit: boolean): string | undefined {
  if (!canEdit) {
    return undefined
  }
  const pin = blockPin(block)
  if (pin === 'missing') {
    return resolve('/(app)/blocks/[id]/move', { id: String(block.id) })
  }
  if (pin === 'estimated') {
    return resolve('/(app)/blocks/[id]/edit', { id: String(block.id) })
  }
  return undefined
}

/**
 * Pin the block from the first photo whose EXIF carries a usable location. Never throws: the
 * upload is the real action, so every failure is reported and scanning moves to the next photo.
 */
export async function locateFromPhotos(
  files: File[],
  {
    read,
    report,
    save,
  }: {
    read: (file: File) => Promise<undefined | { errors?: unknown[]; gps?: { latitude?: number; longitude?: number } }>
    report: (cause: unknown) => void
    save: (coordinates: { lat: number; long: number }) => Promise<unknown>
  },
): Promise<PhotoLocationOutcome> {
  let failed = false

  for (const file of files) {
    // By name too: the upload gate admits on the extension, and browsers often send no type.
    if (EXIF_UNREADABLE_TYPES.has(file.type || (imageMimeOf(file.name) ?? ''))) continue

    let gps: undefined | { latitude?: number; longitude?: number }
    try {
      const parsed = await read(file)
      // Any read error (a failed range read, a malformed IFD0) may have hidden a location.
      for (const error of parsed?.errors ?? []) {
        report(error)
        failed = true
      }
      gps = parsed?.gps
    } catch (cause) {
      report(cause)
      failed = true
      continue
    }

    if (!usablePhotoCoordinates(gps)) continue

    try {
      await save({ lat: gps.latitude, long: gps.longitude })
      return 'saved'
    } catch (cause) {
      report(cause)
      failed = true
    }
  }

  return failed ? 'failed' : 'none'
}

/**
 * Whether a photo's EXIF coordinates are usable as a pin. Android hands the browser a redacted
 * copy whose GPS tags survive zero-filled, so exifr yields NaN, which a `!= null` guard admits.
 */
export function usablePhotoCoordinates(
  gps: undefined | { latitude?: number; longitude?: number },
): gps is { latitude: number; longitude: number } {
  const { latitude, longitude } = gps ?? {}
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false
  }
  // A zero-fill that divided cleanly reads as Null Island rather than as absent.
  return latitude !== 0 || longitude !== 0
}
