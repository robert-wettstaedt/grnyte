import { browser } from '$app/environment'

// The visible viewport, tracked so a mobile overlay can size and pin itself to
// the area *above* the on-screen keyboard. `position: fixed` is measured against
// the layout viewport, which the iOS keyboard leaves untouched — so a fixed
// element drifts under/over the keyboard as the page scrolls. Reading these off
// `window.visualViewport` (top offset + visible height) and applying them keeps
// the surface glued to what the user can actually see.
let offsetTop = $state(0)
let height = $state(0)

if (browser && window.visualViewport != null) {
  const vv = window.visualViewport
  const sync = () => {
    offsetTop = vv.offsetTop
    height = vv.height
  }
  sync()
  vv.addEventListener('resize', sync)
  vv.addEventListener('scroll', sync)
}

/** Reactive visible-viewport metrics (`0` on the server / unsupported browsers). */
export function visualViewport(): { height: number; offsetTop: number } {
  return {
    get height() {
      return height
    },
    get offsetTop() {
      return offsetTop
    },
  }
}
