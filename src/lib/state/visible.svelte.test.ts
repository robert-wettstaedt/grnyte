import { afterEach, describe, expect, it, vi } from 'vitest'

/** `document.hidden` is not assignable, so the spy goes on `visibilityState`, which it derives from. */
const visibility = (state: 'hidden' | 'visible') => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

/** Module-level state outlives a case, so every case sets it rather than inheriting the last one's. */
afterEach(() => {
  vi.restoreAllMocks()
  document.dispatchEvent(new Event('visibilitychange'))
})

describe('isVisible', () => {
  it('is true while the document is on screen', async () => {
    const { isVisible } = await import('./visible.svelte')
    visibility('visible')
    expect(isVisible()).toBe(true)
  })

  it('goes false when the tab is backgrounded', async () => {
    const { isVisible } = await import('./visible.svelte')
    visibility('hidden')
    expect(isVisible()).toBe(false)
  })

  it('comes back when the tab is foregrounded again', async () => {
    const { isVisible } = await import('./visible.svelte')
    visibility('hidden')
    visibility('visible')
    expect(isVisible()).toBe(true)
  })

  // The INITIAL value, read before any event arrives. This is what stops a tile mounted in an
  // already-hidden tab from polling until the first visibilitychange, and no assertion above
  // reaches it: they all dispatch an event first and overwrite it.
  const freshImport = async (state: 'hidden' | 'visible') => {
    vi.resetModules()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    return (await import('./visible.svelte')).isVisible
  }

  it('starts hidden when the tab was already in the background at import', async () => {
    const isVisible = await freshImport('hidden')
    expect(isVisible()).toBe(false)
  })

  it('starts visible when the tab was on screen at import', async () => {
    const isVisible = await freshImport('visible')
    expect(isVisible()).toBe(true)
  })

  // One listener for the whole app is the reason this module exists: `MediaGrid` does not
  // virtualise, so a per-component flag meant one document listener per tile.
  it('registers a single listener however many readers there are', async () => {
    // Reset and spy BEFORE the first import, or both imports are cache hits from the cases above,
    // the module body never re-runs and the spy records nothing: the count then measures the
    // absence of registration rather than the number of them, and fifty listeners would pass.
    vi.resetModules()
    const spy = vi.spyOn(document, 'addEventListener')
    const first = await import('./visible.svelte')
    const second = await import('./visible.svelte')
    expect(first.isVisible).toBe(second.isVisible)
    expect(spy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1)
  })
})
