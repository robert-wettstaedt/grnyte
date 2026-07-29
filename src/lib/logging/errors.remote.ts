import { command, getRequestEvent, query } from '$app/server'
import { APP_PERMISSION_ADMIN } from '$lib/auth'
import { db } from '$lib/db/db.server'
import { clientErrorLogs } from '$lib/db/schema'
import { error as httpError } from '@sveltejs/kit'
import { desc, sql } from 'drizzle-orm'
import z from 'zod'

// Persists a client-side error. Deliberately not `authedCommand`: errors can happen
// logged-out, and the table has RLS on with no insert policy — so we use the
// privileged db client and take `createdBy` from the server session, never the client.
// ponytail: open endpoint with a capped payload; add rate-limiting if it gets abused.
export const logClientError = command(
  z.object({
    error: z.string().max(10_000),
    navigator: z.json().optional(),
    pathname: z.string().max(2048).optional(),
  }),
  async ({ error, navigator, pathname }) => {
    const { locals } = getRequestEvent()

    await db.insert(clientErrorLogs).values({
      createdBy: locals.user?.id ?? null,
      error,
      navigator: navigator ?? null,
      pathname: pathname ?? null,
    })
  },
)

/** One distinct error, however many times it has happened. */
export interface ErrorLogGroup {
  count: number
  error: string
  /** Millis, so the caller can format it against `Date.now()`. */
  lastSeen: number
  paths: string[]
  source: string
}

/**
 * The error log, grouped by message, for app admins. Grouping is the whole point: 200 rows
 * of one stack read as 200 problems. Identical stacks collapse; a different line number is a
 * different group, which is the honest answer anyway.
 */
export const listErrorLogs = query(async (): Promise<ErrorLogGroup[]> => {
  const { locals } = getRequestEvent()

  // The table has RLS on with no policies, so this reads through the privileged client and
  // this check is the only thing standing in front of it. Not defence in depth: the gate.
  if (!locals.userPermissions?.includes(APP_PERMISSION_ADMIN)) {
    httpError(403, 'Forbidden')
  }

  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      error: clientErrorLogs.error,
      // A raw `sql` selection skips Drizzle's field mapping, so this arrives as whatever
      // postgres-js decoded it to (a string for timestamptz). `new Date` below takes either.
      lastSeen: sql<Date | string>`max(${clientErrorLogs.createdAt})`,
      paths: sql<(null | string)[]>`array_agg(distinct ${clientErrorLogs.pathname})`,
      source: clientErrorLogs.source,
    })
    .from(clientErrorLogs)
    .groupBy(clientErrorLogs.error, clientErrorLogs.source)
    .orderBy(desc(sql`max(${clientErrorLogs.createdAt})`))
    // ponytail: newest 100 groups, no paging. Add paging when 100 distinct errors is a real day.
    .limit(100)

  return rows.map((row) => ({
    ...row,
    error: row.error ?? '',
    lastSeen: new Date(row.lastSeen).getTime(),
    // array_agg keeps NULL pathnames as a null entry.
    paths: row.paths.filter((path) => path != null),
  }))
})
