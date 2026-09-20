import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The landing page may not be prerendered or cached at the edge.
 *
 * Its server load returns `signedIn`, and the page renders a different call to action for a member
 * than for a visitor. A prerendered or ISR'd `/` would serve one of those two answers to everybody:
 * whoever rendered it first decides whether the rest of the world is told they are signed in.
 *
 * A comment would not survive the next person reaching for the obvious win, because this is exactly
 * the page somebody optimises for SEO. `app-server-loads.test.ts` is the same idea for the `(app)`
 * group.
 *
 * Both directories, because `prerender` cascades: setting it on the root layout reaches this page
 * just as surely as setting it on the page itself.
 */
const CASCADES_INTO_LANDING = ['src/routes', 'src/routes/(landing)']

/** Kit reads route options out of `+page`/`+layout` modules and nowhere else. */
const configBearing = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\+(page|layout)(\.server)?\.(js|ts)$/.test(entry.name))
    .map((entry) => join(dir, entry.name))

describe('the landing page', () => {
  it('renders per request, so the signed-in call to action cannot be cached and served to everybody', () => {
    const files = CASCADES_INTO_LANDING.flatMap(configBearing)

    // The guard is only as good as its reach: an empty list would pass every assertion below.
    expect(files).toContain('src/routes/(landing)/+page.server.ts')

    for (const file of files) {
      const source = readFileSync(file, 'utf8')

      expect({ file, prerender: /export\s+const\s+prerender/.test(source) }).toEqual({ file, prerender: false })
      expect({ config: /export\s+const\s+config/.test(source), file }).toEqual({ config: false, file })
    }
  })
})
