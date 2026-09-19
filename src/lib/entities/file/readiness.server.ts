import { db } from '$lib/db/db.server'
import { bunnyStreams, files } from '$lib/db/schema'
import { notify } from '$lib/entities/notification/notification.server'
import { logServerFailure } from '$lib/logging/failure.server'
// Type-only, so nothing here pulls the provider's `$env/static/private` keys into a test.
import type { VideoProvider } from '$lib/videos/provider.server'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { HostAnswer, VideoReadiness } from './dto'

/** Below this the uploader is still on the screen that shows the video appear, so a push is noise.
 *  Measured from upload, which needs no extra column. */
const NOTIFY_AFTER_MS = 5 * 60 * 1000

/**
 * Above this the news has gone stale, so the sweep corrects the row and says nothing.
 *
 * Only the sweep ever reaches it: a webhook answers in minutes. By the time one has been lost this
 * long the uploader has either not opened the app, or has opened it and watched the clip play,
 * because the client probe promotes a tile the moment the playlist exists without waiting for the
 * record. Anchored on the 24 hours `0131` used to backfill `ready`, so the rows this silences are
 * exactly the ones that backfill would have covered had they existed then.
 */
const NOTIFY_WITHIN_MS = 24 * 60 * 60 * 1000

/** Readiness rows corrected per sweep. See {@link reconcileReadiness} for why this is bounded. */
const RECONCILE_LIMIT = 100

/**
 * The one statement of the promote-only rule (`readiness` in CONTEXT.md), shared by the webhook and
 * the reconciliation sweep, so the two can never disagree. Returns whether a row moved.
 *
 * The `ne(readiness, 'ready')` guard is not demotion protection, because a demoting status maps to
 * `pending` and returns above. It stops a redelivery from marking the notification unread again.
 */
export async function promoteReadiness(guid: string, readiness: VideoReadiness): Promise<boolean> {
  if (readiness === 'pending') {
    return false
  }
  const guard = readiness === 'ready' ? ne(bunnyStreams.readiness, 'ready') : eq(bunnyStreams.readiness, 'pending')
  const moved = await db
    .update(bunnyStreams)
    .set({ readiness })
    .where(and(eq(bunnyStreams.id, guid), guard))
    .returning({ id: bunnyStreams.id })
  if (moved.length === 0) {
    return false
  }
  if (readiness === 'ready') {
    await notifyUploader(guid)
  }
  return true
}

/**
 * Correct readiness the webhook never reached: a delivery lost to a deploy or an outage, or a
 * video uploaded before the webhook was configured at all.
 *
 * Only `pending` rows can be stale, because the rule above is promote-only, so in healthy
 * conditions this reads nothing and makes no requests. Takes the provider rather than reaching for
 * `getVideoProvider()`, so a test can answer for the host without mocking the module.
 *
 * Returns how many rows actually moved, which is what the job reports.
 */
export async function reconcileReadiness(provider: VideoProvider): Promise<number> {
  // Bounded: one serial host call per row, inside the same timeout as the retention deletes.
  // Unbounded, a webhook broken for a while would take the whole job down. The rest waits.
  const stale = await db
    .select({ id: bunnyStreams.id })
    .from(bunnyStreams)
    .where(eq(bunnyStreams.readiness, 'pending'))
    // Randomised, because a row can stay `pending` across runs. At the head of a stable scan those
    // rows burn the whole budget every run and starve newer ones out.
    .orderBy(sql`random()`)
    .limit(RECONCILE_LIMIT)
  let corrected = 0
  let failed = 0
  for (const { id } of stale) {
    // One host 5xx must not abort the rest of the sweep.
    try {
      const readiness = readinessToWrite(await provider.readinessOf(id))
      if (readiness != null && (await promoteReadiness(id, readiness))) {
        corrected += 1
      }
    } catch (error) {
      // Not logServerFailure: it dedupes on the exact string, so a GUID gives every row its own
      // key and a host outage writes one alerting row per video.
      console.error('[cleanup] readiness reconcile failed', id, error)
      failed += 1
    }
  }
  // A constant string, because `logServerFailure` dedupes on the exact message. The counts stay on
  // the console above, where they cost nothing. Scoped `cleanup` and not `readiness`: the scope is
  // part of that dedupe key, so renaming it silently splits the alert history in two.
  if (failed > 0) {
    await logServerFailure('cleanup', 'readiness reconcile: lookups failed, see the console for which')
  }
  return corrected
}

/**
 * Tell the uploader their video is playable. Here rather than in the two callers, because both want
 * it. Never fatal: a failed notification must not roll back the readiness write.
 */
async function notifyUploader(guid: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        createdAt: files.createdAt,
        createdBy: files.createdBy,
        fileId: files.id,
        regionFk: files.regionFk,
      })
      .from(bunnyStreams)
      .innerJoin(files, eq(files.id, bunnyStreams.fileFk))
      .where(eq(bunnyStreams.id, guid))
    if (row?.createdBy == null || row.createdAt == null) {
      return
    }
    const age = Date.now() - row.createdAt.getTime()
    if (age < NOTIFY_AFTER_MS || age > NOTIFY_WITHIN_MS) {
      return
    }
    await notify({
      actorFk: row.createdBy,
      object: { id: row.fileId, type: 'file' },
      regionFk: row.regionFk,
      sourceType: 'video_ready',
      userFks: [row.createdBy],
    })
  } catch (error) {
    console.error('[readiness] video_ready notification failed', guid, error)
  }
}

/**
 * What the sweep should write for what the host said, or `undefined` to leave the row alone.
 *
 * `gone` writes nothing. A 404 says the host has no record, which is not the same as "this video
 * will never play": a transient 404, from consistency lag on a fresh upload or a blip answering 404
 * instead of 5xx, is indistinguishable from a real deletion in a single answer. `failed` is a
 * one-way door nothing revisits, so acting on one 404 makes a good video permanently unwatchable,
 * fixable only by hand in the database. Left `pending` the row is simply re-asked next sweep, which
 * costs one request a day and is self-correcting. An age gate was tried and dropped: it protects
 * fresh uploads, and the sweep's population is mostly OLD rows whose webhook was lost, so it
 * guarded the slice least at risk. Two consecutive `gone` answers would settle it properly, but
 * that needs state this does not have.
 *
 * A video the host says genuinely FAILED still lands as `failed`: that comes from its status, not
 * from its absence.
 */
function readinessToWrite(answer: HostAnswer | undefined): undefined | VideoReadiness {
  // No `answer == null` clause: undefined is not 'gone', so it already falls through and returns
  // itself. Mutation testing proved the guard dead (equivalent mutant on every input).
  return answer === 'gone' ? undefined : answer
}
