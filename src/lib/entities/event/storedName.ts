import { blockName } from '$lib/entities/block/mapper'
import { toDisplayName } from '$lib/entities/displayName'

// A name kept in history for a row that may be gone. A nameless row keeps a marker instead of a
// fallback, so "Unnamed" or "Block 3" is minted in the READER's language, not the writer's.
const NAMELESS = '\u0001'

/** A stored name as a reader sees it. */
export function readStoredName(value: string | undefined): string | undefined {
  if (value == null || !value.startsWith(NAMELESS)) return value
  const order = value.slice(NAMELESS.length)
  return order === '' ? toDisplayName('') : blockName('', Number(order))
}

/** What history stores for a name: the name itself, or the marker (with a block's slot). */
export function storedName(name: null | string, blockOrder?: number): string {
  if (name != null && name.trim() !== '') return name
  return blockOrder == null ? NAMELESS : `${NAMELESS}${blockOrder}`
}
