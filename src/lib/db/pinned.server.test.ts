// @vitest-environment node
/**
 * `pinnedTx` is the whole defence against an inherited `search_path`, so these hold the two
 * properties that can break silently.
 *
 * Deliberately does NOT poison a connection. The local `DATABASE_URL` is the shared Supavisor
 * pooler, transaction mode runs no reset query, and a stray session-level `SET` there outlives
 * the process and fails every other suite until the container is restarted. The leak itself is
 * proven out of band (`docs/pooler-incident/`, against Postgres 17.6 behind supavisor 1.1.56).
 */
import { PINNED_SEARCH_PATH } from '$lib/db/db.server'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { carriesPublic, classifySearchPath, pinnedTx, searchPathProbe } from './pinned.server'
import { reachable } from './testDb'

const currentPath = sql`select current_setting('search_path') as sp`
/** `to_regclass` resolves through `search_path`, so it answers null exactly where a real query
 *  would raise 42P01, without needing a table to exist for the test. */
const unqualified = sql`select to_regclass('files') as reg`

describe.skipIf(!reachable)('pinnedTx', () => {
  it('pins search_path for the body of the read', async () => {
    const rows = await pinnedTx((tx) => tx.execute<{ sp: string }>(currentPath))

    expect(rows[0]?.sp).toBe(PINNED_SEARCH_PATH)
  })

  it('propagates a failing body and does not swallow it in the report path', async () => {
    // The report runs in a `finally`, because an inherited `search_path` is what makes bodies
    // throw. A `finally` that returned or threw of its own would hide the real error.
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

      // The capture, which is what the poisoned-connection report is built on.
      expect(rows[0]?.before).toBe('pg_catalog')
      // And the pin, applied by the same statement.
      const after = await tx.execute<{ sp: string }>(currentPath)
      expect(after[0]?.sp).toBe(PINNED_SEARCH_PATH)
    })
  })
})

/**
 * The detector's predicate. No database: it decides whether a connection gets reported, and a
 * substring test here is a detector that stays quiet through the incident it exists to catch.
 */
describe('carriesPublic', () => {
  it.each([
    ['"$user", public, extensions', true],
    ['public, extensions', true],
    ['public', true],
    ['"public", extensions', true],
    ['  public  ,extensions', true],
  ])('accepts %j', (value, expected) => {
    expect(carriesPublic(value)).toBe(expected)
  })

  it.each([
    ['', false],
    ['pg_catalog, pg_temp', false],
    // The case a substring test gets wrong: "public" appears, nothing in `public` resolves.
    ['pg_catalog, public_backup', false],
    ['my_public_schema', false],
  ])('rejects %j', (value, expected) => {
    expect(carriesPublic(value)).toBe(expected)
  })
})

/**
 * What gets reported. `expected` is the untouched role default; anything else was left by another
 * client, and the still-working case is reported too because naming the poisoner is the point.
 */
describe('classifySearchPath', () => {
  it('stays quiet for an untouched connection', () => {
    // The REAL stored value, backslash and all: Supabase stores the role default as `"\\$user"`,
    // and matching it against a literal reported every healthy connection as poisoned.
    expect(classifySearchPath('"\\$user", public, extensions')).toBe('expected')
    expect(classifySearchPath('"$user", public, extensions')).toBe('expected')
    // What `pinnedTx` itself pins, which is transaction-local and so indistinguishable from healthy.
    expect(classifySearchPath('public, extensions')).toBe('expected')
  })

  it('reports a path that lost extensions', () => {
    // What `seed-volume.ts` used to leave. Resolves `public`, so not an outage, but it is a leak.
    expect(classifySearchPath('public')).toBe('unexpected')
    expect(classifySearchPath('"$user", public')).toBe('unexpected')
  })

  it('reports a path that cannot resolve public as broken', () => {
    expect(classifySearchPath('')).toBe('broken')
    expect(classifySearchPath('pg_catalog, pg_temp')).toBe('broken')
  })
})
