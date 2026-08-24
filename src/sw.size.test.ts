import { existsSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A ceiling on the emitted service worker.
 *
 * `src/sw.ts` is a second application. Vite builds it separately (`configFile: false`, so
 * `build.target` does not reach it either, see AGENTS.md), it imports freely from `$lib`, and
 * nothing about it appears in the app's bundle report. One transitive import of `zod` for a
 * five-field push payload put **309 KB** into `sw.js` - the whole library, localized validation
 * messages for every locale included - and the build said nothing at all.
 *
 * That cost lands where it hurts most: a worker script is re-parsed every time the browser starts
 * it, which it does aggressively, and re-downloaded on every deploy, on the low-end phones the
 * offline feature exists for.
 *
 * The number is a tripwire, not a budget. If a change genuinely needs more room, raise it and say
 * why in the commit; what must not happen is 300 KB arriving unnoticed.
 */
const MAX_BYTES = 120 * 1024

const BUILT_WORKER = 'build/client/sw.js'

describe('service worker size', () => {
  it.runIf(existsSync(BUILT_WORKER))(`stays under ${MAX_BYTES / 1024} KB`, () => {
    // Skipped rather than failed when there is no build: `npm test` runs constantly without one,
    // and a test that demands `npm run build` first would just be turned off.
    expect(statSync(BUILT_WORKER).size).toBeLessThan(MAX_BYTES)
  })
})
