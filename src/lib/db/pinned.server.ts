import { db, PINNED_SEARCH_PATH } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { logServerFailure } from '$lib/logging/failure.server'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

// `PromiseLike`, not `Promise`: drizzle's query builders are thenable but are not Promises, so
// `(tx) => tx.query.x.findMany(...)` would otherwise not typecheck without an extra `await`.
type Body<T> = (tx: PostgresJsDatabase<typeof schema>) => PromiseLike<T>

/** `broken` cannot resolve `public` and is the 42P01 outage. `unexpected` resolves but has lost
 *  `extensions`, so somebody narrowed it: reported too, because naming the poisoner is the point.
 *  Element-wise, never a substring test: `pg_catalog, public_backup` contains "public" and
 *  resolves nothing. */
export function classifySearchPath(searchPath: string): 'broken' | 'expected' | 'unexpected' {
  const names = schemaNames(searchPath)

  if (!names.includes('public')) {
    return 'broken'
  }

  return names.includes('extensions') ? 'expected' : 'unexpected'
}

/**
 * Runs `body` on the privileged handle with `search_path` pinned for the transaction. Reads and
 * writes both: most call sites are writes.
 *
 * Every unqualified table name is exposed without this. The transaction pooler runs no reset
 * query, so a session-level `search_path` left behind by another client on a pooled server
 * connection is inherited by whoever is handed it next, and the whole schema stops resolving:
 * `42P01 relation "files" does not exist` while the table is plainly there. Measured on
 * production's stack (Postgres 17.6 behind Supavisor 1.1.56, transaction mode): one stray
 * `SET search_path` poisons 1 of ~15 server connections, `SET LOCAL` inside a transaction is
 * immune at 0/30, and a startup parameter is silently dropped. Drizzle cannot schema-qualify
 * `public` (`pgSchema('public')` throws by design), so this is the only fix open to the query
 * builder, and it puts the statements on one connection as a side effect.
 *
 * Prefer ONE wrap per request or job over one per statement: each is a transaction.
 *
 * Never call it from inside an RLS handler's transaction: that holds one connection and waits for
 * a second, so `max` such callers at once deadlock (measured, `repro-nested-deadlock.mts`: 9 pass
 * at `max: 10`, 10 hang). Defer with `Context.afterCommit`, or answer it with a definer as `0132`
 * does. A handler that wants the gate but no transaction takes `command` plus `authedRls`. Naming
 * the current offenders here is what kept rotting, so this says the rule and not a census.
 */
export async function pinnedTx<T>(body: Body<T>): Promise<T> {
  let before: string | undefined

  try {
    return await db.transaction(async (tx) => {
      const rows = await tx.execute<{ before: string }>(searchPathProbe())
      before = rows[0]?.before
      return body(tx)
    })
  } finally {
    // Outside the transaction: a pool slot is held from BEGIN to COMMIT, not just while a query
    // runs, so a report issued from inside queues its own checkout behind the slot its caller is
    // still holding. Fire-and-forget, so that delays reports rather than deadlocking them.
    // In `finally`, because an inherited `search_path` is exactly what makes the body throw.
    reportInheritedSearchPath(before)
  }
}

/**
 * Reads the connection's current `search_path` and pins it, in one round trip.
 *
 * `materialized` is load-bearing, not decoration: since PG12 a single-reference side-effect-free
 * CTE is inlined by default, which would fold `current_setting` back into the same target list as
 * `set_config` and leave the ordering to the planner. Exported so the test asserts that ordering
 * against the statement this actually runs.
 */
export function searchPathProbe() {
  return sql`with probe as materialized (select current_setting('search_path') as before)
             select probe.before, set_config('search_path', ${PINNED_SEARCH_PATH}, true) as applied from probe`
}

/**
 * The reported list as bare schema names, so callers ask about MEMBERSHIP and never match the
 * whole string. Supabase stores the login role's default as `"\$user", public, extensions`,
 * backslash and all, and `current_setting` hands it back verbatim: comparing that against a
 * literal is what once reported every healthy connection as poisoned.
 *
 * Stripping quotes and backslashes is belt and braces, not the fix. Only `public` and `extensions`
 * are ever looked up, and neither is quoted.
 */
function schemaNames(searchPath: string): string[] {
  return searchPath.split(',').map((entry) => entry.trim().replace(/["\\]/g, ''))
}

/** The last value reported, so a connection that stays poisoned does not log once per query. */
let lastReported: string | undefined

/**
 * Names a connection that arrived carrying somebody else's `search_path`.
 *
 * This is the only look anyone gets at the poisoner, which is still unidentified: it is in
 * neither this application, its dependencies, nor any function in the schema, and `pg_dump`
 * through the pooler was measured NOT to leak. Both sinks on purpose, because the console goes to
 * Vercel and is kept for days, while `client_error_logs` is ours and is kept for 90.
 *
 * Exported so a test can drive the dedupe without poisoning a shared connection.
 */
export function reportInheritedSearchPath(before: string | undefined): void {
  if (before == null) {
    return
  }

  const verdict = classifySearchPath(before)
  if (verdict === 'expected') {
    return
  }

  // One line and one row per distinct value per instance. A poisoned connection is drawn by every
  // request that touches it: `logServerFailure` dedupes over 24h, but only after opening a
  // transaction of its own, so outside this guard it costs one per query for the whole incident.
  if (before !== lastReported) {
    lastReported = before
    console.error(`[db] pooled connection arrived ${verdict} with search_path=${before}`)
    // Not awaited: a report must never fail the query that found it.
    void logServerFailure('db', `pooled connection arrived ${verdict} with search_path ${before}`)
  }
}
