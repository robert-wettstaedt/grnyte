import { goToSibling, isNavKeyExempt } from '$lib/components/SiblingNav/siblingNav'
import { sheetState } from './sheetState.svelte'

/**
 * Window-keydown handler for the sheet's prev/next nav (j = prev, l = next,
 * mirroring the nav arrows), inert while typing or with modifiers held. Attached
 * by Modal and Panel so every consumer gets the same shortcuts for free.
 * `onback` runs on Escape (the Modal's Dialog closes on Escape itself).
 */
export function sheetNavKeydown(options: { onback?: () => void } = {}) {
  return (event: KeyboardEvent) => {
    if (isNavKeyExempt(event)) return

    const key = event.key.toLowerCase()
    if (key === 'escape') {
      options.onback?.()
      return
    }

    const nav = sheetState.nav
    if (nav == null) return

    if (key === 'j') {
      event.preventDefault()
      void goToSibling(nav.prev.href)
    } else if (key === 'l') {
      event.preventDefault()
      void goToSibling(nav.next.href)
    }
  }
}
