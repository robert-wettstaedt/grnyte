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
