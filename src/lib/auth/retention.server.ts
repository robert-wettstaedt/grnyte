import { pinnedTx } from '$lib/db/pinned.server'
import { authCodeAttempts, authEvents } from '$lib/db/serverOnly'
import { DAY_MS } from '$lib/i18n/relativeTime'
import { lt, sql } from 'drizzle-orm'

/** grnyte's auth events and GoTrue's own audit log. */
export const AUTH_LOG_MAX_AGE_MS = 90 * DAY_MS
/** Past every counter's window, so a row this old counts nothing. */
export const CODE_ATTEMPT_MAX_AGE_MS = DAY_MS

/** Drops both auth logs past `logsBefore` and code counters untouched since `attemptsBefore`; rows removed. */
export const sweepAuthLogs = async (logsBefore: Date, attemptsBefore: Date): Promise<number> =>
  pinnedTx(async (tx) => {
    const events = await tx.delete(authEvents).where(lt(authEvents.createdAt, logsBefore))
    const audit = await tx.execute(
      sql`delete from auth.audit_log_entries where created_at < ${logsBefore.toISOString()}`,
    )
    const attempts = await tx.delete(authCodeAttempts).where(lt(authCodeAttempts.windowStartedAt, attemptsBefore))
    return events.count + audit.count + attempts.count
  })
