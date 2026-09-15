/** Shared by the scenarios in this folder: the login, and the guards that make a bad run say why. */

const BASE = process.env.MEMLAB_URL ?? 'http://localhost:4173'

/** Set when the client cannot reach zero-cache, so the failure names itself instead of timing out. */
let syncError

/**
 * PUBLIC_ZERO_URL is baked at build time, so a build made while `.env` pointed at the Tailscale
 * mount syncs against a host that is not running, and every interaction fails on an empty page.
 */
function assertSynced() {
  if (syncError != null) {
    throw new Error(`Zero never connected, so nothing renders. Check PUBLIC_ZERO_URL in the build: ${syncError}`)
  }
}

/** Clicks the first anchor with a layout box: the nav is duplicated as TabBar (mobile) + NavRail. */
async function clickVisibleLink(page, href) {
  await page.waitForSelector(`a[href="${href}"]`)

  for (const link of await page.$$(`a[href="${href}"]`)) {
    if ((await link.boundingBox()) != null) {
      await link.click()
      return
    }
  }

  throw new Error(`no visible link to ${href}`)
}

/** Signing in is a remote form, so the redirect is a client-side navigation, not a page load. */
async function signIn(page) {
  page.on('console', (msg) => {
    const text = msg.text()
    if (/WebSocket connection to .* failed|Failed to connect/.test(text)) {
      syncError ??= text
    }
  })

  try {
    await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    throw new Error(`Nothing is serving ${BASE}. Start it with \`npx vite preview\` and leave it running.`, {
      cause: error,
    })
  }

  if (!page.url().includes('/auth/signin')) {
    return
  }

  await page.type('input[type="email"]', process.env.MEMLAB_EMAIL ?? '')
  await page.type('input[type="password"]', process.env.MEMLAB_PASSWORD ?? '')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => !globalThis.location.pathname.startsWith('/auth'), { timeout: 30_000 })
}

module.exports = { assertSynced, BASE, clickVisibleLink, signIn }
