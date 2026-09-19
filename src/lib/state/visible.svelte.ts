import { browser } from '$app/environment'

// Whether this document is on screen, tracked once for the whole app. Every surface that polls
// something wants to stop while the tab is in the background, and `MediaGrid` does not virtualise,
// so a component-local flag meant one document listener per tile: thirty on a busy route page, all
// computing the same boolean.
//
// Initialised from the document rather than assumed true: a tile mounted in an ALREADY hidden tab
// would otherwise poll until the first visibilitychange. `visibilityState`, not `hidden`, matching
// every other module in here; they are equivalent by spec and only this one is spyable in a test.
let visible = $state(!browser || document.visibilityState === 'visible')

if (browser) {
  // `visibilitychange` alone, unlike `online.svelte.ts`, which also listens for `pageshow` and
  // `focus`. That is there because an installed iOS app was measured not re-evaluating
  // CONNECTIVITY on resume. Visibility is read live off the document, so those are redundant here.
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible'
  })
}

/** Whether the document is on screen. `true` on the server, where there is nothing to hide. */
export function isVisible(): boolean {
  return visible
}
