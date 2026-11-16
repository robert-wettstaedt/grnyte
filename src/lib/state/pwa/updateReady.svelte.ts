/**
 * Whether this document is running code older than the worker that now controls it. NOT "an update
 * is waiting to install": `sw.ts` skips waiting, so the new worker is already active and in control.
 *
 * A leaf with no imports on purpose. `serviceWorker.ts` reaches a `.remote.ts` via
 * `$lib/logging/report`, and a jsdom test of anything reading this flag dies on that import (see the
 * `projects` note in `vite.config.ts`).
 */
let updateReady = $state(false)

/**
 * Click handler for a logo showing the badge, on the anchor itself. A full document load, because
 * `beforeNavigate` ignores a same-pathname change and both logos point at `/explore` from inside the
 * layout that serves it, so on the start screen the badge would otherwise do nothing.
 *
 * Modified clicks are left alone; a new tab loads the current build anyway.
 */
export function applyUpdateOnClick(event: MouseEvent & { currentTarget: HTMLAnchorElement }): void {
  if (!updateReady || event.defaultPrevented || event.button !== 0) {
    return
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return
  }

  event.preventDefault()
  location.href = event.currentTarget.href
}

/** Reactive. Reading this inside `$derived`/`$effect` subscribes to update state. */
export function isUpdateReady(): boolean {
  return updateReady
}

/** Written by `registerServiceWorker` and nothing else; it owns the arm/disarm rules. */
export function setUpdateReady(value: boolean): void {
  updateReady = value
}
