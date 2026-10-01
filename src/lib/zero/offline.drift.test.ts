import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { astOf, uncovered, type Ast } from './coverage'
import { guidebookQueryDefs } from './guidebook'
import { GUIDEBOOK_COVERED, OFFLINE_QUERIES } from './offline'
import { queries } from './queries'

/**
 * The table and the sync have to agree.
 *
 * `OFFLINE_QUERIES` is what every screen reads to decide whether an empty result means "we chose not
 * to keep this" or "this device has not got it". `z.svelte.ts` is what pulls the rows. Those
 * are two halves of one decision held in two files, and the failure when they drift is silent: a
 * query listed as kept but never preloaded renders as though the data were merely late, and a query
 * preloaded but listed as excluded tells the reader to reconnect for rows already on their device.
 *
 * Read as source rather than executed, because `z.svelte.ts` needs a browser, a session and a live
 * Zero client to do anything. That makes this a spelling check, not a proof: it catches the name
 * dropping out of the preload, which is the way this rots, and not a query preloaded with
 * arguments so narrow it fetches nothing.
 */
// Relative to the repo root, like the other source-reading tests: this suite runs under jsdom,
// where `import.meta.url` is an http URL and `new URL(...)` against it is not a file path.
const SOURCE = readFileSync('src/lib/zero/z.svelte.ts', 'utf-8')

describe('the offline policy table', () => {
  it('preloads every query it says is kept', () => {
    // `z.preload(queries.X(`, not `queries.X(` anywhere: two of these names also appear in a
    // `z.run` call, and the looser match let those two be satisfied by the `run` alone: both
    // `preload` lines could have been deleted with every assertion here still green.
    const missing = [...OFFLINE_QUERIES.always, ...OFFLINE_QUERIES.field].filter(
      (name) => !SOURCE.includes(`z.preload(queries.${name}(`),
    )

    expect(missing).toEqual([])
  })

  it('preloads nothing it says is excluded', () => {
    const contradicted = OFFLINE_QUERIES.excluded.filter((name) => SOURCE.includes(`z.preload(queries.${name}(`))

    expect(contradicted).toEqual([])
  })

  it('classifies each query at most once', () => {
    const all = [...OFFLINE_QUERIES.always, ...OFFLINE_QUERIES.excluded, ...OFFLINE_QUERIES.field, ...GUIDEBOOK_COVERED]

    expect(all.length).toBe(new Set(all).size)
  })
})

function astOfQuery(name: keyof typeof queries, args: unknown): Ast {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design
  return astOf((queries[name] as any).fn({ args, ctx: { authUserId: 'drift' } }))
}

/** Every filter switched on, so a table reached only through a filter's `exists` counts too. */
const EVERY_BRANCH = {
  block: { areaId: 1, blockId: 1 },
  listAreas: { content: 'x', id: 1, limit: 1, parentFk: 1, references: 'x' },
  listBlocks: { areaId: 1, blockId: 1, content: 'x', limit: 1, references: 'x' },
  listRoutes: {
    areaId: 1,
    content: 'x',
    firstAscensionists: [1],
    // Off: beta videos live on route files and other people's ascents, which no preload has ever
    // kept, so this filter is already unanswerable offline. On, it would excuse a `files` relation.
    hasBeta: false,
    hasTopo: true,
    maxGrade: 1,
    minGrade: 1,
    minRating: 1,
    references: 'x',
    regionFk: 1,
    routeId: 1,
    tags: ['x'],
  },
} satisfies Record<(typeof GUIDEBOOK_COVERED)[number], object>

describe('the guidebook covers every query that claims it', () => {
  const guidebook = Object.keys(guidebookQueryDefs).map((name) => astOfQuery(name as keyof typeof queries, undefined))

  it.each(GUIDEBOOK_COVERED)('%s reaches nothing the guidebook does not sync', (name) => {
    expect(uncovered([astOfQuery(name, {}), astOfQuery(name, EVERY_BRANCH[name])], guidebook)).toEqual([])
  })
})
