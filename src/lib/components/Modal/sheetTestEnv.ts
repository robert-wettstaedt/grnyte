// What a test rendering a mobile sheet needs from jsdom. Import it before the component under test.
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
