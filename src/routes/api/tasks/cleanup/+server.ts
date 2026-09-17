import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private'
import { PUBLIC_SUPABASE_URL } from '$env/static/public'
import { db } from '$lib/db/db.server'
import { clientErrorLogs, feedback, notifications } from '$lib/db/schema'
import { reportBunnyOrphans } from '$lib/entities/file/cleanup.server'
import { STAGING_BUCKET } from '$lib/entities/file/upload'
import { ERROR_LOG_MAX_AGE_DAYS, logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { isCronAuthorized } from '$lib/remote/cron.server'
import { getVideoProvider } from '$lib/videos/provider.server'
import { createClient } from '@supabase/supabase-js'
import { json } from '@sveltejs/kit'
import { and, isNotNull, isNull, lt, or } from 'drizzle-orm'
import type { RequestHandler } from './$types'

/** Staging orphans past this age are abandoned-form or failed-finalize leftovers. */
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Bunny orphans past this age are dead: the TUS resume window is 24h, so 48h clears clock skew too. */
const BUNNY_MAX_AGE_MS = 48 * 60 * 60 * 1000

/** A notification somebody has already opened is history the inbox does not render. */
const NOTIFICATION_READ_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** One they never opened is kept three times as long before it is written off as never read. */
const NOTIFICATION_UNREAD_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

/** Feedback. 12 months, mirrored in the privacy notice, section 7: change both together. */
const FEEDBACK_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/** Error logs, client and server alike. The figure is published, so it lives beside the writer
 *  that owns them. Nothing pruned them before, so the table only ever grew. */
const ERROR_LOG_MAX_AGE_MS = ERROR_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000

/** Delete staging objects older than the cutoff. Service-role: the sweep spans every user's own-uid folder. */
const sweepStaging = async (before: Date): Promise<number> => {
  const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const bucket = admin.storage.from(STAGING_BUCKET)
  // ponytail: two-level walk (folders are per auth-uid), 100 objects/page. Fine for
  // a daily job; switch to the S3 list API if the user count ever outgrows one page.
  const { data: folders, error } = await bucket.list()
  if (error != null || folders == null) {
    console.error('[cleanup] staging list failed', error)
    await logServerFailure('cleanup', `staging list failed: ${stringifyError(error)}`)
    return 0
  }
  let removed = 0
  for (const folder of folders) {
    if (folder.id != null) {
      continue // a stray file at the bucket root, not a uid folder
    }
    const { data: objects, error: listError } = await bucket.list(folder.name)
    if (listError != null || objects == null) {
      console.error('[cleanup] staging list failed for folder', folder.name, listError)
      await logServerFailure('cleanup', `staging list failed for folder ${folder.name}: ${stringifyError(listError)}`)
      continue
    }
    const stale = objects
      .filter((object) => object.created_at != null && new Date(object.created_at) < before)
      .map((object) => `${folder.name}/${object.name}`)
    if (stale.length > 0) {
      const { error: removeError } = await bucket.remove(stale)
      if (removeError != null) {
        console.error('[cleanup] staging remove failed', stale, removeError)
        // The count, not the paths: each one carries an auth uid and a file name.
        await logServerFailure(
          'cleanup',
          `staging remove failed for ${stale.length} objects: ${stringifyError(removeError)}`,
        )
        continue
      }
      // Audit trail: log exactly what was deleted so a wrong sweep is diagnosable.
      console.log('[cleanup] removed staging objects', stale)
      removed += stale.length
    }
  }
  return removed
}

/**
 * Delete Bunny videos created but never uploaded (still placeholder-titled) past the cutoff.
 *
 * Title-based rather than a DB diff, for now. {@link reportBunnyOrphans} computes the diff
 * alongside without acting on it.
 */
const sweepBunny = async (before: Date): Promise<number> => {
  const provider = getVideoProvider()
  const guids = await provider.listStaleUploads(before)
  if (guids.length > 0) {
    // Audit trail: log every deleted GUID so a wrong sweep is diagnosable.
    console.log('[cleanup] removing orphaned videos', guids)
  }
  let removed = 0
  for (const guid of guids) {
    // Isolate per-GUID failures: one Bunny 5xx must not abort the rest of the sweep.
    try {
      await provider.remove(guid)
      removed += 1
    } catch (error) {
      console.error('[cleanup] video remove failed', guid, error)
      await logServerFailure('cleanup', `video remove failed for ${guid}: ${stringifyError(error)}`)
    }
  }
  return removed
}

/**
 * Drop notifications nobody is going to read again.
 *
 * About bounding what Zero syncs into every replica, not about what is on screen: the inbox
 * query is capped at a page either way. Unread rows get three times the grace, since deleting
 * one is deleting something that was never delivered.
 */
const sweepNotifications = async (readBefore: Date, unreadBefore: Date): Promise<number> => {
  const removed = await db
    .delete(notifications)
    .where(
      or(
        and(isNotNull(notifications.readAt), lt(notifications.readAt, readBefore)),
        and(isNull(notifications.readAt), lt(notifications.createdAt, unreadBefore)),
      ),
    )
    .returning({ id: notifications.id })
  return removed.length
}

/**
 * Drop feedback past its retention: from the reply where the row has one, from arrival where it does not.
 * Hard delete, not anonymisation, since the privacy notice promises message and reply both go and clear the
 * backups within 30 days (section 7).
 */
const sweepFeedback = async (before: Date): Promise<number> => {
  const removed = await db
    .delete(feedback)
    .where(
      or(
        and(isNotNull(feedback.repliedAt), lt(feedback.repliedAt, before)),
        and(isNull(feedback.repliedAt), lt(feedback.createdAt, before)),
      ),
    )
    .returning({ id: feedback.id })
  return removed.length
}

/** Drop error logs past the cutoff. A fault nobody looked at in three months is not one anybody
 *  is going to diagnose, and every row carries a pathname and a user agent. */
const sweepErrorLogs = async (before: Date): Promise<number> => {
  const removed = await db
    .delete(clientErrorLogs)
    .where(lt(clientErrorLogs.createdAt, before))
    .returning({ id: clientErrorLogs.id })
  return removed.length
}

export const POST: RequestHandler = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = Date.now()
  const [staging, bunny, notificationRows, feedbackRows, errorRows] = await Promise.all([
    sweepStaging(new Date(now - STAGING_MAX_AGE_MS)),
    sweepBunny(new Date(now - BUNNY_MAX_AGE_MS)),
    sweepNotifications(new Date(now - NOTIFICATION_READ_MAX_AGE_MS), new Date(now - NOTIFICATION_UNREAD_MAX_AGE_MS)),
    sweepFeedback(new Date(now - FEEDBACK_MAX_AGE_MS)),
    sweepErrorLogs(new Date(now - ERROR_LOG_MAX_AGE_MS)),
    // Alongside the deletes, not ahead of them: it walks the whole Bunny library, and its own
    // failure must never cost a retention delete this job promises.
    reportBunnyOrphans(db, new Date(now - BUNNY_MAX_AGE_MS)),
  ])
  console.log(
    `[cleanup] removed ${staging} staging objects, ${bunny} orphaned videos, ${notificationRows} notifications, ${feedbackRows} feedback, ${errorRows} error logs`,
  )
  return json({ bunny, errorLogs: errorRows, feedback: feedbackRows, notifications: notificationRows, staging })
}
