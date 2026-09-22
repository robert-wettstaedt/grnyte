// @vitest-environment node
/**
 * Deliberately does NOT poison a connection. The local `DATABASE_URL` is the shared pooler, and a
 * session-level `SET` there outlives the process and fails every other suite until the container
 * restarts. The leak itself is proven out of band, in `docs/pooler-incident/`.
 */
import { PINNED_SEARCH_PATH } from '$lib/db/db.server'
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { classifySearchPath, pinnedTx, searchPathProbe } from './pinned.server'
import { reachable } from './testDb'

const currentPath = sql`select current_setting('search_path') as sp`
/** `to_regclass` resolves through `search_path`, so it answers null exactly where a real query
 *  raises 42P01. */
const unqualified = sql`select to_regclass('files') as reg`

describe.skipIf(!reachable)('pinnedTx', () => {
  it('pins search_path for the body of the read', async () => {
    const rows = await pinnedTx((tx) => tx.execute<{ sp: string }>(currentPath))

    expect(rows[0]?.sp).toBe(PINNED_SEARCH_PATH)
  })

  it('propagates a failing body and does not swallow it in the report path', async () => {
    // The report runs in a `finally`, and a `finally` that returns or throws hides the real error.
    const boom = new Error('boom')

    await expect(
      pinnedTx(async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
  })

  it('restores name resolution on a connection that cannot see public', async () => {
    // The production symptom, reproduced transaction-locally so nothing escapes onto the pool.
    await pinnedTx(async (tx) => {
      await tx.execute(sql`select set_config('search_path', 'pg_catalog', true)`)
      const broken = await tx.execute<{ reg: null | string }>(unqualified)
      expect(broken[0]?.reg).toBeNull()

      await tx.execute(searchPathProbe())

      const fixed = await tx.execute<{ reg: null | string }>(unqualified)
      expect(fixed[0]?.reg).toBe('files')
    })
  })
})

describe.skipIf(!reachable)('searchPathProbe', () => {
  it('reports the value the connection arrived with, not the one it sets', async () => {
    // `set_config(..., true)` is transaction-local, so nothing here escapes onto the pool.
    await pinnedTx(async (tx) => {
      await tx.execute(sql`select set_config('search_path', 'pg_catalog', true)`)

      const rows = await tx.execute<{ before: string }>(searchPathProbe())

      // The capture the report is built on.
      expect(rows[0]?.before).toBe('pg_catalog')
      // And the pin, applied by the same statement.
      const after = await tx.execute<{ sp: string }>(currentPath)
      expect(after[0]?.sp).toBe(PINNED_SEARCH_PATH)
    })
  })
})

/** What gets reported. `expected` is the untouched role default. Anything else came from another
 *  client, including the case that still resolves, because naming the poisoner is the point. */
describe('classifySearchPath', () => {
  it('stays quiet for an untouched connection', () => {
    // The real stored value, backslash and all. Supabase stores the role default as `"\\$user"`,
    // and matching that against a literal reported every healthy connection as poisoned.
    expect(classifySearchPath('"\\$user", public, extensions')).toBe('expected')
    expect(classifySearchPath('"$user", public, extensions')).toBe('expected')
    // What `pinnedTx` pins, which is transaction-local and so reads as healthy.
    expect(classifySearchPath('public, extensions')).toBe('expected')
  })

  it('reports a path that lost extensions', () => {
    // What `seed-volume.ts` used to leave. It resolves `public`, so it leaks without an outage.
    expect(classifySearchPath('public')).toBe('unexpected')
    expect(classifySearchPath('"$user", public')).toBe('unexpected')
  })

  it('reports a path that cannot resolve public as broken', () => {
    expect(classifySearchPath('')).toBe('broken')
    expect(classifySearchPath('pg_catalog, pg_temp')).toBe('broken')
  })

  // The cases a substring test gets wrong: "public" appears, nothing in `public` resolves.
  it('is element-wise, not a substring match', () => {
    expect(classifySearchPath('pg_catalog, public_backup')).toBe('broken')
    expect(classifySearchPath('my_public_schema')).toBe('broken')
    // Quoted and padded entries still resolve.
    expect(classifySearchPath('"public", extensions')).toBe('expected')
    expect(classifySearchPath('  public  ,extensions')).toBe('expected')
  })
})

/** The dedupe. A poisoned connection is drawn by every request that touches it, and a row each is
 *  one extra transaction per query. Fresh module per case, because the dedupe is module state. */
describe('reportInheritedSearchPath', () => {
  const load = async () => {
    vi.resetModules()
    const logged: string[] = []
    vi.doMock('$lib/logging/failure.server', () => ({
      logServerFailure: (_scope: string, reason: string) => {
        logged.push(reason)
        return Promise.resolve()
      },
    }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { reportInheritedSearchPath } = await import('./pinned.server')
    return { logged, report: reportInheritedSearchPath }
  }

  it('writes one row per distinct value, not one per query', async () => {
    const { logged, report } = await load()

    report('pg_catalog, pg_temp')
    report('pg_catalog, pg_temp')
    report('pg_catalog, pg_temp')
    expect(logged).toHaveLength(1)

    // A different value is a different incident and has to be named.
    report('public')
    expect(logged).toHaveLength(2)
  })

  it('says nothing about a healthy connection or an absent reading', async () => {
    const { logged, report } = await load()

    report('"\\$user", public, extensions')
    report('public, extensions')
    report(undefined)

    expect(logged).toEqual([])
  })
})
