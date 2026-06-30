import type { SheetNav } from './sheetState.svelte'

interface Sibling {
  id: number
  name: string
}

/**
 * Wrap-around prev/next over an ordered sibling list, shaped for the sheet's nav
 * controls. Both ends wrap (next past the last → first, prev before the first →
 * last). Returns null when there are fewer than two siblings or the current item
 * isn't in the list yet (still loading), so callers can clear the nav.
 */
export function toSheetNav(
  siblings: readonly Sibling[] | null | undefined,
  currentId: number | null | undefined,
  href: (id: number) => string,
): SheetNav | null {
  if (siblings == null || currentId == null || siblings.length < 2) return null

  const i = siblings.findIndex((sibling) => sibling.id === currentId)
  if (i < 0) return null

  const n = siblings.length
  const prev = siblings[(i - 1 + n) % n]
  const next = siblings[(i + 1) % n]
  return {
    prev: { href: href(prev.id), label: prev.name },
    next: { href: href(next.id), label: next.name },
    position: i + 1,
    total: n,
  }
}
