import { db } from '$lib/db/db.server'
import { clientErrorLogs } from '$lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'
import { MAX_ERROR_LENGTH } from './stringify'

/** How long an identical message counts as already recorded. A cron runs every five minutes and
 *  the condition that failed it is usually still there, so one stuck row would be 288 a day. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

/** How long an error log lives. `/api/tasks/cleanup` sweeps it. The privacy notice publishes this
 *  number in both locales, so it is a promise, and `failure.server.test.ts` holds the two together. */
export const ERROR_LOG_MAX_AGE_DAYS = 90

/**
 * Record a server failure that nothing else can observe: it throws nothing, shows nobody anything,
 * and no caller can act on it. `hooks.server.ts` already covers everything that throws.
 *
 * Two kinds do not belong here. A failure whose caller still returns an error is already visible.
 * A recurring job restating an unchanged condition floods the table, so keep that on the console.
 *
 * Put whatever identifies the failing thing in `reason`, or the dedupe collapses every instance
 * into one row. The push sender names the subscription, so four dead devices read as four.
 */
export async function logServerFailure(scope: string, reason: string): Promise<void> {
  const error = `[${scope}] ${reason}`.slice(0, MAX_ERROR_LENGTH)

  try {
    const [recent] = await db
      .select({ id: clientErrorLogs.id })
      .from(clientErrorLogs)
      .where(
        and(
          eq(clientErrorLogs.error, error),
          eq(clientErrorLogs.source, 'server'),
          gt(clientErrorLogs.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS)),
        ),
      )
      .limit(1)

    if (recent != null) {
      return
    }

    await db.insert(clientErrorLogs).values({ error, source: 'server' })
  } catch {
    // Best effort, like the client reporter: a failing log must not hide what it reports.
  }
}
