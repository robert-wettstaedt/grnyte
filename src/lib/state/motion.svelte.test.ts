/**
 * The one place a Svelte transition can learn that the reader asked for stillness: the transitions
 * themselves ignore the query, so a duration that does not pass through here animates regardless.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

async function withPreference(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: () => {},
    matches: query.includes('prefers-reduced-motion: reduce') && reduce,
    removeEventListener: () => {},
  }))
  vi.resetModules()
  return import('./motion.svelte')
}

// The module builds its MediaQuery at import, so a leaked stub would outlive this file if Vitest's
// per-file isolation were ever switched off.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('motion', () => {
  it('gives the base duration when no preference is set', async () => {
    const { motion, prefersStill } = await withPreference(false)

    expect(motion()).toBe(150)
    expect(motion(220)).toBe(220)
    expect(prefersStill()).toBe(false)
  })

  it('collapses every duration to 0 when the reader asked for stillness', async () => {
    const { motion, prefersStill } = await withPreference(true)

    expect(motion()).toBe(0)
    expect(motion(220)).toBe(0)
    expect(prefersStill()).toBe(true)
  })

  it('collapses a computed delay too, not only a literal base', async () => {
    const { motion } = await withPreference(true)

    expect(motion(3 * 25)).toBe(0)
  })

  it('treats a zero delay as zero, not as "use the default"', async () => {
    const { motion } = await withPreference(false)

    // The first item of a staggered list passes `index * 25`. Only a default PARAMETER gets this
    // right; `base || 150` would give it a 150ms delay.
    expect(motion(0 * 25)).toBe(0)
  })
})
