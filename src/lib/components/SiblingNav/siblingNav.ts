/** Prev/next navigation between sibling entities. Each caller renders it in its own
 *  layout (the sheet's mobile pill / desktop footer, a standalone page's own footer). */
export interface SheetNav {
  next: { href: string; label: string }
  position: number
  prev: { href: string; label: string }
  total: number
}

interface Sibling {
  id: number
  name: string
}

/** True when nav shortcuts should stay inert: a modifier is held or the user is
 *  typing in a form field. Shared by the sheet's j/l handler and page-level keys. */
export function isNavKeyExempt(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey || isTypingInField(event)
}

/** True when the user is typing in a form field, so keyboard shortcuts should stay inert. Shared by
 *  window-level keydown handlers (the sheet nav, the topo editor) that must not hijack keys mid-edit. */
export function isTypingInField(event: KeyboardEvent): boolean {
  const target = event.target
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]') != null
}

/**
 * Wrap-around prev/next over an ordered sibling list. Both ends wrap (next past the
 * last → first, prev before the first → last). Returns null when there are fewer than
 * two siblings or the current item isn't in the list yet (still loading), so callers
 * can clear the nav.
 */
export function toSheetNav(
  siblings: null | readonly Sibling[] | undefined,
  currentId: null | number | undefined,
  href: (id: number) => string,
): null | SheetNav {
  if (siblings == null || currentId == null || siblings.length < 2) return null

  const i = siblings.findIndex((sibling) => sibling.id === currentId)
  if (i < 0) return null

  const n = siblings.length
  const prev = siblings[(i - 1 + n) % n]
  const next = siblings[(i + 1) % n]
  return {
    next: { href: href(next.id), label: next.name },
    position: i + 1,
    prev: { href: href(prev.id), label: prev.name },
    total: n,
  }
}
