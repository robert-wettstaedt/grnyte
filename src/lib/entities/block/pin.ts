import { resolve } from '$app/paths'
import type { BlockDetail } from './dto'

/** How much is known about a block's location, as `LocationMeta` renders it. */
export type BlockPin = 'estimated' | 'missing' | 'set'

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
