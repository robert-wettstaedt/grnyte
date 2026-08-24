import { existsSync, readFileSync, statSync } from 'node:fs'
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

describe('the built service worker', () => {
  // Skipped rather than failed when there is no build: `npm test` runs constantly without one, and a
  // test that demanded `npm run build` first would just be turned off. CI builds before testing.
  const withBuild = it.runIf(existsSync(BUILT_WORKER))

  withBuild(`stays under ${MAX_BYTES / 1024} KB`, () => {
    expect(statSync(BUILT_WORKER).size).toBeLessThan(MAX_BYTES)
  })

  withBuild('precaches the offline shell', () => {
    // The shell is the whole offline story: every offline navigation is answered with it, and
    // `sw.ts` reads it straight out of the precache with no second copy behind it. It gets there
    // only by being prerendered (`src/routes/offline/+page.ts`), so a config change that stopped
    // prerendering it would take offline with it - silently, because nothing else would fail.
    expect(readFileSync(BUILT_WORKER, 'utf-8')).toContain('"url":"offline"')
  })
})
