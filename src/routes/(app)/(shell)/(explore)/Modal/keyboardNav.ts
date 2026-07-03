import { goto } from '$app/navigation'
import { sheetState } from './sheetState.svelte'

/** True when nav shortcuts should stay inert: a modifier is held or the user is
 *  typing in a form field. Shared by the sheet's j/l handler and page-level keys. */
export function isNavKeyExempt(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]') != null
}

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

    /* eslint-disable svelte/no-navigation-without-resolve -- nav hrefs are pre-resolved (toSheetNav). */
    if (key === 'j') {
      event.preventDefault()
      goto(nav.prev.href)
    } else if (key === 'l') {
      event.preventDefault()
      goto(nav.next.href)
    }
    /* eslint-enable svelte/no-navigation-without-resolve */
  }
}
