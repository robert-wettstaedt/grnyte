import { db, PINNED_SEARCH_PATH } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { logServerFailure } from '$lib/logging/failure.server'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

// `PromiseLike`, not `Promise`: a drizzle query builder is thenable but is not a Promise, so a
// body that returns one directly would need an extra `await`.
type Body<T> = (tx: PostgresJsDatabase<typeof schema>) => PromiseLike<T>

/** `broken` cannot resolve `public`, which is the 42P01 outage. `unexpected` resolves but lost
 *  `extensions`. Compare names, never substrings: `public_backup` contains "public". */
export function classifySearchPath(searchPath: string): 'broken' | 'expected' | 'unexpected' {
  const names = schemaNames(searchPath)

  if (!names.includes('public')) {
    return 'broken'
  }

  return names.includes('extensions') ? 'expected' : 'unexpected'
}

/**
 * Runs `body` on the privileged handle with `search_path` pinned for the transaction.
 *
 * The transaction pooler runs no reset query, so a `search_path` another client left on a pooled
 * connection is inherited and every unqualified name fails with 42P01. Drizzle cannot qualify
 * `public`, so pinning is the only fix open to the query builder.
 *
 * Use one wrap per request or job, because each one is a transaction. Never call it inside an RLS
 * handler's transaction: that holds one connection and waits for a second, so `max` such callers
 * at once deadlock. Defer with `Context.afterCommit`, or answer it with a definer as `0132` does.
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
    // Outside the transaction, because a pool slot is held from BEGIN to COMMIT and a report sent
    // from inside would queue behind its own caller. In `finally`, because a bad path throws here.
    reportInheritedSearchPath(before)
  }
}

/** Reads the connection's `search_path` and pins it in one round trip. `materialized` stops PG12
 *  from inlining the CTE, which would leave the read and the write order to the planner. */
export function searchPathProbe() {
  return sql`with probe as materialized (select current_setting('search_path') as before)
             select probe.before, set_config('search_path', ${PINNED_SEARCH_PATH}, true) as applied from probe`
}

/** Bare schema names, so callers test membership instead of the whole string. Supabase stores the
 *  role default as `"\$user", public, extensions` and `current_setting` returns it verbatim. */
function schemaNames(searchPath: string): string[] {
  return searchPath.split(',').map((entry) => entry.trim().replace(/["\\]/g, ''))
}

/** The last value reported, so a connection that stays poisoned does not log once per query. */
let lastReported: string | undefined

/** Names a connection that arrived with somebody else's `search_path`. The poisoner is still
 *  unidentified, so this is the only look anyone gets at it. Both sinks on purpose: the console
 *  goes to Vercel for days, `client_error_logs` is ours for 90. */
export function reportInheritedSearchPath(before: string | undefined): void {
  if (before == null) {
    return
  }

  const verdict = classifySearchPath(before)
  if (verdict === 'expected') {
    return
  }

  // One line and one row per distinct value. `logServerFailure` dedupes over 24h, but only after
  // opening a transaction, so without this guard a poisoned connection costs one row per query.
  if (before !== lastReported) {
    lastReported = before
    console.error(`[db] pooled connection arrived ${verdict} with search_path=${before}`)
    // Not awaited: a report must never fail the query that found it.
    void logServerFailure('db', `pooled connection arrived ${verdict} with search_path ${before}`)
  }
}
