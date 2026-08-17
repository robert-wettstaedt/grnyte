import z from 'zod'

/**
 * The push contract: what a payload holds, and when one is due.
 *
 * Pure, and imported by BOTH the sender and `src/sw.ts`, which is the point. A service worker
 * parsing a shape the server does not produce is the failure mode 1.0 shipped with, and it is
 * invisible: the push arrives, the parse throws, and nothing appears.
 */

/** Groups every digest into one OS notification, so a new one replaces the last rather than
 *  stacking. A digest is a complete restatement, never an addition. */
export const DIGEST_TAG = 'digest'

/** Its own tag per row, so two directed events do not replace one another. */
export const directedTag = (notificationId: number): string => `notification:${notificationId}`

export const pushPayloadSchema = z.object({
  /**
   * Unread directed notifications, as the server counted them. The service worker sets the app
   * badge from this rather than from how many OS notifications happen to be lying around: those
   * are two different numbers, and only this one is the inbox.
   */
  badge: z.number().optional(),
  body: z.string().optional(),
  /** Where a tap goes. `notificationclick` routes on it. */
  pathname: z.string().optional(),
  tag: z.string(),
  title: z.string(),
})

export type PushPayload = z.infer<typeof pushPayloadSchema>

/**
 * How long a directed event waits before it is announced.
 *
 * Long enough for a quick typo-fix to settle, so somebody who edits your ascent and immediately
 * corrects themselves buzzes you once. The row also has to still be unread: a push for something
 * already seen in-app is the most annoying kind there is.
 */
export const DIRECTED_DEBOUNCE_MS = 2 * 60 * 1000

/** No new broadcast activity for this long means the burst is over and the digest can go. */
export const DIGEST_QUIET_MS = 20 * 60 * 1000

/**
 * The ceiling on that wait. A continuously active region never goes quiet, so without this its
 * members would never be pushed at all, which is a silent failure rather than a quiet one.
 */
export const DIGEST_MAX_WAIT_MS = 2 * 60 * 60 * 1000

/**
 * Whether a recipient's queued broadcast activity is ready to go out.
 *
 * The quiet period is what turns a forty-minute crag import into one buzz instead of eight; the
 * ceiling is what stops a busy region from being silent forever. Both are measured against the
 * queue itself, so a reader who is caught up has nothing to be ready.
 *
 * `oldestAt`/`newestAt` are epoch millis of the queue's ends, or `undefined` when it is empty.
 */
export function isDigestDue(oldestAt: number | undefined, newestAt: number | undefined, nowMs: number): boolean {
  if (oldestAt == null || newestAt == null) {
    return false
  }

  return nowMs - newestAt >= DIGEST_QUIET_MS || nowMs - oldestAt >= DIGEST_MAX_WAIT_MS
}

/**
 * How many queued activities one digest run will look at per person.
 *
 * The digest reports one headline and a count either way, so a longer tail buys nothing and this
 * runs once per subscriber every five minutes. It also bounds the pathological case: a watermark
 * that is far behind (a fresh account, or somebody who had every category switched off for a
 * while) would otherwise pull a region's whole history into memory.
 */
export const DIGEST_SCAN_LIMIT = 500

/**
 * How far back from "now" a digest scan stops, so a transaction that has not committed yet cannot
 * be stepped over.
 *
 * `events.created_at` is stamped when the row is written and the row becomes visible when its
 * transaction commits, which is later. A scan that read up to the instant it ran could mark past
 * an event stamped a second ago and still in flight, and a timestamp watermark never goes back for
 * it. Ignoring the last half minute costs a digest nothing (it waits for the region to go quiet
 * anyway) and closes that window for any transaction shorter than this.
 */
export const DIGEST_COMMIT_LAG_MS = 30 * 1000

/**
 * How far a person has already been covered, by push or by their own reading.
 *
 * The higher of the two marks: catching up in the feed silences the push for what was read, and a
 * push that went out does not repeat itself. A missing mark is 0, which is right for an account
 * that has never had either.
 */
export function digestFloor(pushedUpTo: null | number | undefined, seenUpTo: null | number | undefined): number {
  return Math.max(pushedUpTo ?? 0, seenUpTo ?? 0)
}

/** Whether a directed row has waited out its debounce. Read state is the caller's to check: it
 *  changes between deciding and sending, and only the caller knows how fresh its copy is. */
export function isDirectedDue(createdAt: number, nowMs: number): boolean {
  return nowMs - createdAt >= DIRECTED_DEBOUNCE_MS
}
