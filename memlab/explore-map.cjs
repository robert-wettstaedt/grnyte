/**
 * memlab scenario: feed -> explore -> back, five times.
 *
 * The map is the leak-prone half of the app (an OpenLayers instance plus its Zero query views mount
 * and unmount on every visit), so this walks in and out of it with client-side navigation. A
 * `page.goto` would reload the document and reset the heap, which hides every leak.
 *
 * Run against a preview build, never `npm run dev`: Vite keeps the module graph alive for HMR and
 * Svelte's dev build retains stack traces, both of which read as retained memory that prod lacks.
 *
 *   npm run build && npx vite preview          # http://localhost:4173, no TLS
 *   MEMLAB_EMAIL=... MEMLAB_PASSWORD=... npm run test:memory
 */

const { assertSynced, BASE, clickVisibleLink, signIn } = require('./shared.cjs')

module.exports = {
  action: async (page) => {
    await clickVisibleLink(page, '/explore')
    await page.waitForSelector('canvas', { timeout: 30_000 })
  },

  back: async (page) => {
    await clickVisibleLink(page, '/feed')
    await page.waitForFunction(() => globalThis.location.pathname.startsWith('/feed'), { timeout: 30_000 })
  },

  beforeInitialPageLoad: signIn,

  // Zero holds an open websocket, so wait on the rendered nav rather than on network idle.
  isPageLoaded: async (page) => {
    await page.waitForSelector('a[href="/explore"]', { timeout: 30_000 })
    assertSynced()
    return true
  },

  name: () => 'explore-map',

  repeat: () => 5,

  url: () => `${BASE}/feed`,
}
