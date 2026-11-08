// What a test rendering a mobile sheet needs from jsdom. Import it before the component under test.
import { afterAll } from 'vitest'

window.matchMedia = (() => ({ addEventListener() {}, matches: false, removeEventListener() {} })) as never

// jsdom has no WAAPI, and a sheet only unmounts once its outro finishes.
Element.prototype.animate = (() => {
  const animation = { cancel() {}, onfinish: null as (() => void) | null }
  setTimeout(() => animation.onfinish?.())
  return animation
}) as never

globalThis.ResizeObserver = class {
  disconnect() {}
  observe() {}
} as never

// An opened sheet schedules an uncancellable 100ms focus timer that reads `document`; let it fire before jsdom goes.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 150)))
