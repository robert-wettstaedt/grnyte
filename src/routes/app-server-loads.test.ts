import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The `(app)` group may not gain a server load.
 *
 * That group is `ssr = false`, and `src/sw.ts` answers an offline navigation with the prerendered
 * shell served in place at the requested URL. But SvelteKit's client router still fetches
 * `__data.json` on its first entry to any route that has a server load, and offline that fetch
 * rejects and drops the navigation to `+error.svelte` instead of the page. The whole offline story
 * for that route is gone, with no build error and nothing in the diff to suggest it.
 *
 * A comment on the one existing exemption could not survive the next person adding a second, so the
 * rule is a test. If a route genuinely needs server data, either move it out of `(app)` or add it
 * below with the reason, knowing it will not work offline.
 */
const ALLOWED = new Set([
  // Creating a region needs a server anyway (it reads `regions.created_by`, which Zero does not
  // sync, and the session email off `locals`), so its offline error state is the honest answer.
  'regions/new/+page.server.ts',
])

const GROUP = 'src/routes/(app)'

describe('the (app) group', () => {
  it('has no server load outside the documented exemptions', () => {
    expect(serverFilesUnder(GROUP)).toEqual([...ALLOWED])
  })
})

/** Every `+page.server.ts` / `+layout.server.ts` under `dir`, as paths relative to it. */
function serverFilesUnder(dir: string): string[] {
  const found: string[] = []

  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)

      if (entry.isDirectory()) {
        walk(path)
      } else if (/^\+(page|layout)\.server\.ts$/.test(entry.name)) {
        found.push(relative(dir, path))
      }
    }
  }

  walk(dir)
  return found.sort()
}
