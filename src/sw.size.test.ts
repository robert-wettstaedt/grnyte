import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A ceiling on the emitted service worker.
 *
 * `src/sw.ts` is a second application. Vite builds it separately (`configFile: false`, so
 * `build.target` does not reach it either, see AGENTS.md), it imports freely from `$lib`, and
 * nothing about it appears in the app's bundle report. One transitive import of `zod` for a
 * five-field push payload put **309 KB** into `sw.js` (the whole library, localized validation
 * messages for every locale included), and the build said nothing at all.
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
const BUILT_SHELL = 'build/prerendered/offline.html'

describe('the built service worker', () => {
  // Skipped rather than failed when there is no build: `npm test` runs constantly without one, and a
  // test that demanded `npm run build` first would be turned off. CI builds before testing.
  const withBuild = it.runIf(existsSync(BUILT_WORKER))

  withBuild(`stays under ${MAX_BYTES / 1024} KB`, () => {
    expect(statSync(BUILT_WORKER).size).toBeLessThan(MAX_BYTES)
  })

  withBuild('precaches the offline shell', () => {
    // The shell is the whole offline story: every offline navigation is answered with it, and
    // `sw.ts` reads it straight out of the precache with no second copy behind it. It gets there
    // only by being prerendered (`src/routes/offline/+page.ts`), so a config change that stopped
    // prerendering it would take offline with it: silently, because nothing else would fail.
    expect(readFileSync(BUILT_WORKER, 'utf-8')).toContain('"url":"offline"')
  })
})

/** Comments in this repo quote both of the literals below, so match on code only. */
function code(path: string): string {
  return readFileSync(path, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * Whether the worker skips waiting and whether the plugin is told it does have to agree, and
 * nothing else checks it: both halves are valid alone, the build succeeds, the types are satisfied,
 * and the only symptom is a chunk 404 on somebody's phone weeks later.
 *
 * Both directions fail, because both are silent. `skipWaiting()` under the default `'prompt'` leaves
 * the reload wired to a `waiting` event that cannot fire for such a worker; `'autoUpdate'` without
 * `skipWaiting()` listens on `activated`, which a worker that waits does not reach while a tab is
 * open. Either way updates reach nobody. `$lib/state/serviceWorker.ts` carries the detail.
 *
 * Read as text rather than by importing the config, because the option is consumed inside
 * `SvelteKitPWA()` and is not readable back off the plugins it returns.
 */
describe('the worker lifecycle and the registration strategy', () => {
  it('skips waiting exactly when the plugin is told it does', () => {
    const skipsWaiting = code('src/sw.ts').includes('self.skipWaiting()')
    const autoUpdate = code('vite.config.ts').includes(`registerType: 'autoUpdate'`)

    expect(autoUpdate).toBe(skipsWaiting)
  })
})

describe('the prerendered offline shell', () => {
  const withBuild = it.runIf(existsSync(BUILT_SHELL))

  // `sw.ts` answers a navigation to `/areas/594` with this file, so its asset URLs have to be
  // absolute: a relative one resolves against whatever path it is answering for and 404s a level
  // too deep. SvelteKit guarantees that only for its own SPA fallback, which this is not: here it
  // holds because `svelte.config.js` pins `paths.relative: false`, and Kit's default is `true`.
  // Nothing else fails if that pin goes: the shell is still prerendered, still precached, still
  // served, and boots only at `/offline` itself.
  withBuild('references its assets absolutely', () => {
    const html = readFileSync(BUILT_SHELL, 'utf-8')

    expect(html).toContain('href="/_app/')
    expect(html).not.toMatch(/(?:href|src)="\.{1,2}\//)
  })
})
