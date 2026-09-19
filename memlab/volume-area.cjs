/**
 * memlab scenario: an area and one of its sectors, in and out five times, at production volume.
 *
 * `explore-map.cjs` walks the map, which draws region 18 aggregated as one marker per area and so
 * never renders a long list. This walks into a sector of "Area 01" (region 18 "Volume Test": 500
 * routes over five sectors, ~100 each), which is the shape a real region has and the shape that
 * retained 3.6MB of feed cards. Answers what ONE navigation costs at that scale.
 *
 *   npm run build:profile && npx vite preview
 *   MEMLAB_EMAIL=... MEMLAB_PASSWORD=... npx memlab run --scenario memlab/volume-area.cjs --work-dir .memlab
 */

const { assertSynced, BASE, clickVisibleLink, signIn } = require('./shared.cjs')

/** "Area 01" in region 18. Its five sectors are the children this walks into. */
const AREA = '/areas/669'

/** Whichever child the page actually links to, so a reshuffled fixture does not silently pass. */
async function firstSector(page) {
  const href = await page.$$eval(
    'a[href^="/areas/"]',
    (links, parent) =>
      links.map((link) => link.getAttribute('href')).find((it) => it !== parent && /^\/areas\/\d+$/.test(it)),
    AREA,
  )

  if (href == null) {
    throw new Error(`${AREA} lists no child area to walk into. Check region 18 still has its sectors.`)
  }

  return href
}

module.exports = {
  action: async (page) => {
    await clickVisibleLink(page, await firstSector(page))
    await page.waitForSelector('a[href^="/routes/"]', { timeout: 30_000 })
  },

  // History back, so the return is a client-side navigation like the way in.
  back: async (page) => {
    await page.goBack()
    await page.waitForFunction((area) => globalThis.location.pathname === area, { timeout: 30_000 }, AREA)
  },

  beforeInitialPageLoad: signIn,

  isPageLoaded: async (page) => {
    await page.waitForSelector('a[href^="/areas/"]', { timeout: 30_000 })
    assertSynced()
    return true
  },

  name: () => 'volume-area',

  repeat: () => 5,

  url: () => `${BASE}${AREA}`,
}
