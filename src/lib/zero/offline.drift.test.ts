import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OFFLINE_QUERIES } from './offline'

/**
 * The table and the sync have to agree.
 *
 * `OFFLINE_QUERIES` is what every screen reads to decide whether an empty result means "we chose not
 * to keep this" or "this device has not got it". `z.svelte.ts` is what actually pulls the rows. Those
 * are two halves of one decision held in two files, and the failure when they drift is silent: a
 * query listed as kept but never preloaded renders as though the data were merely late, and a query
 * preloaded but listed as excluded tells the reader to reconnect for rows already on their device.
 *
 * Read as source rather than executed, because `z.svelte.ts` needs a browser, a session and a live
 * Zero client to do anything. That makes this a spelling check, not a proof: it catches the name
 * dropping out of the preload, which is the way this actually rots, and not a query preloaded with
 * arguments so narrow it fetches nothing.
 */
// Relative to the repo root, like the other source-reading tests: this suite runs under jsdom,
// where `import.meta.url` is an http URL and `new URL(...)` against it is not a file path.
const SOURCE = readFileSync('src/lib/zero/z.svelte.ts', 'utf-8')

describe('the offline policy table', () => {
  it('preloads every query it says is kept', () => {
    // `z.preload(queries.X(`, not `queries.X(` anywhere: two of these names also appear in a
    // `z.run` call, and the looser match let those two be satisfied by the `run` alone - both
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
    const all = [...OFFLINE_QUERIES.always, ...OFFLINE_QUERIES.excluded, ...OFFLINE_QUERIES.field]

    expect(all.length).toBe(new Set(all).size)
  })
})
