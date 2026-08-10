import { CRON_API_KEY } from '$env/static/private'
import { db } from '$lib/db/db.server'
import { activities, notifications, pushSubscriptions, users, userSettings } from '$lib/db/schema'
import { isAscentActivity } from '$lib/entities/activity/dto'
import { notificationView } from '$lib/entities/notification/caption'
import { digestCopy, type DigestActivity } from '$lib/entities/notification/digest.server'
import { readableRegions } from '$lib/entities/notification/notification.server'
import {
  DIGEST_SCAN_LIMIT,
  DIGEST_TAG,
  digestFloor,
  directedTag,
  isDigestDue,
  isDirectedDue,
} from '$lib/entities/notification/push'
import { isPushConfigured, sendPushToUser, subscriptionsFor } from '$lib/entities/notification/push.server'
import { resolveMessage } from '$lib/i18n/message'
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime'
import { json } from '@sveltejs/kit'
import { and, count, eq, gt, inArray, isNull, max, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from './$types'

/**
 * The push cron. Driven by pg_cron every five minutes, gated by the same `x-api-key` as
 * `/api/tasks/cleanup-uploads`.
 *
 * Two halves that look alike from outside and are nothing alike underneath:
 *
 * - **Directed.** One push per unread `notifications` row that has waited out its debounce. Its
 *   own tag, its own sentence, and it stops existing the moment the reader opens the inbox.
 * - **Broadcast.** One digest per person, counted off two integers on `user_settings` rather than
 *   off a row per recipient. Held back until the region goes quiet, or until the queue is old
 *   enough that waiting for quiet would mean never.
 *
 * Every send is best effort. A push that fails is not retried: the next digest restates the same
 * thing, and a directed row that never went out is still sitting in the inbox.
 *
 * Nothing in this repo schedules it, exactly like `/api/tasks/cleanup-uploads`: pg_cron lives in
 * the database, and the URL and secret differ per environment. Register it once per deployment,
 * and the failure mode if you forget is silent (no pushes, no errors):
 *
 * ```sql
 * select cron.schedule('notifications', '*\/5 * * * *', $$
 *   select net.http_post(
 *     url := 'https://<host>/api/tasks/notifications',
 *     headers := '{"x-api-key": "<CRON_API_KEY>"}'::jsonb
 *   );
 * $$);
 * ```
 */

/** Same x-api-key gate the pg_cron caller uses for the cleanup task. */
const authorized = (request: Request): boolean => {
  const key = request.headers.get('x-api-key')
  if (key == null || key.length === 0 || CRON_API_KEY.length === 0) {
    return false
  }
  try {
    return timingSafeEqual(Buffer.from(key), Buffer.from(CRON_API_KEY))
  } catch {
    return false
  }
}

/**
 * Run `task` over `items` a few at a time, and collect the results.
 *
 * One at a time was the shape both halves had: a subscriber's queries and its HTTPS send waiting
 * on the previous subscriber's, inside a job that has five minutes.
 *
 * ponytail: a fixed width rather than a queue, deliberately below the ten-slot database pool this
 * shares with the rest of the process. Upgrade = one ranked query over all subscribers, if the
 * subscriber list ever outgrows the window.
 */
async function inBatches<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []

  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    results.push(...(await Promise.all(items.slice(index, index + BATCH_SIZE).map(task))))
  }

  return results
}

const BATCH_SIZE = 4

/** The language to write to this account in. Same field the invite mail reads. */
const localeOf = (contactLocale: null | string): Locale =>
  contactLocale != null && isLocale(contactLocale) ? contactLocale : baseLocale

/** Move a person's push watermark forward, never back. */
async function advanceWatermark(userFk: number, activityId: number): Promise<void> {
  await db
    .update(userSettings)
    .set({ pushedUpToActivityId: sql`greatest(coalesce(${userSettings.pushedUpToActivityId}, 0), ${activityId})` })
    .where(eq(userSettings.userFk, userFk))
}

/** Which switch governs an activity. Everything that is not an ascent or a person is a crag edit,
 *  which is what `notify_moderations` always actually meant before it was renamed. */
function categoryEnabled(
  activity: Pick<DigestActivity, 'columnName' | 'entityType'>,
  settings: { notifyAscents: boolean | null; notifyCommunity: boolean | null; notifyCragEdits: boolean | null },
): boolean {
  // Through the feed's own definition rather than a copy of it, so the switch cannot come to mean
  // something the segmented control does not.
  if (isAscentActivity(activity)) {
    return settings.notifyAscents !== false
  }

  if (activity.entityType === 'user') {
    return settings.notifyCommunity !== false
  }

  return settings.notifyCragEdits !== false
}

/** Usernames by id, for the digest headline's actor slot. */
async function namesOf(userFks: readonly number[]): Promise<Map<number, string>> {
  const ids = [...new Set(userFks)]
  if (ids.length === 0) {
    return new Map()
  }

  const rows = await db.query.users.findMany({
    columns: { id: true, username: true },
    where: (table, { inArray: within }) => within(table.id, ids),
  })

  return new Map(rows.map((row) => [row.id, row.username]))
}

/**
 * The digest: for each subscriber, whatever region activity has landed above both watermarks.
 *
 * `greatest(pushedUpTo, seenUpTo)` is the floor, so catching up in the feed silences the push for
 * what was read and a push never repeats itself. The watermark moves whether or not a device took
 * the payload, for the same reason the directed half stamps `pushedAt` unconditionally.
 */
async function sendDigests(nowMs: number): Promise<number> {
  // Only people with a device to push to. Everything below is per-recipient, and this is what
  // keeps that work the length of the subscriber list rather than of the user table.
  const subscribers = await db
    .selectDistinct({
      contactLocale: userSettings.contactLocale,
      notifyAscents: userSettings.notifyAscents,
      notifyCommunity: userSettings.notifyCommunity,
      notifyCragEdits: userSettings.notifyCragEdits,
      pushedUpTo: userSettings.pushedUpToActivityId,
      seenUpTo: userSettings.seenUpToActivityId,
      userFk: pushSubscriptions.userFk,
    })
    .from(pushSubscriptions)
    // INNER, not LEFT. A subscriber with no `user_settings` row has no watermark to move, and an
    // UPDATE against a row that does not exist affects nothing and reports success - which would
    // make the same digest go out every five minutes, forever. `subscribeToPush` creates the row,
    // so this only skips accounts whose settings went missing, and only until they touch settings.
    .innerJoin(userSettings, eq(userSettings.userFk, pushSubscriptions.userFk))

  if (subscribers.length === 0) {
    return 0
  }

  const userFks = subscribers.map((row) => row.userFk)
  const subscriptions = await subscriptionsFor(userFks)
  const unread = await unreadCounts(userFks)
  // Membership alone is not the rule: the `activities` SELECT policy also requires a role that
  // holds `region.read`, and a digest naming entities the reader cannot open would be worse than
  // no digest. Once for the batch, because asking per subscriber was a round trip each before the
  // scan below had even started.
  const regionsByUser = await readableRegions(userFks)
  // The starting line for anybody who has never had a watermark, see below.
  const [{ newestActivityId }] = await db.select({ newestActivityId: max(activities.id) }).from(activities)

  const sendDigest = async (subscriber: (typeof subscribers)[number]): Promise<boolean> => {
    // Both marks null means never initialised, which is NOT the same as "caught up to nothing":
    // `digestFloor` reads it as 0, and this person would be pushed the region's entire history 500
    // activities at a time, once per run, until it caught up. `subscribeToPush` seeds the marks on
    // a FIRST subscription, so the accounts that land here are the ones that already had one when
    // their settings row appeared: everybody who carried a 1.0 subscription across (0096 backfills
    // those), and anybody whose settings row is created afterwards by a writer that is not
    // `subscribeToPush`. First sight is the starting line, exactly as it is for a new subscriber.
    if (subscriber.pushedUpTo == null && subscriber.seenUpTo == null) {
      await advanceWatermark(subscriber.userFk, newestActivityId ?? 0)
      return false
    }

    const floor = digestFloor(subscriber.pushedUpTo, subscriber.seenUpTo)
    const regions = regionsByUser.get(subscriber.userFk) ?? []

    if (regions.length === 0) {
      return false
    }

    const queued = await db
      .select({
        columnName: activities.columnName,
        createdAt: activities.createdAt,
        entityId: activities.entityId,
        entityType: activities.entityType,
        id: activities.id,
        metadata: activities.metadata,
        newValue: activities.newValue,
        // The name of a DELETED entity lives nowhere else: `entityNames` finds nothing for it, and
        // the headline then falls back to whichever value column the verb says carries the name.
        // Leaving it out renders every deletion with `common_unnamed`.
        oldValue: activities.oldValue,
        parentEntityId: activities.parentEntityId,
        parentEntityType: activities.parentEntityType,
        regionFk: activities.regionFk,
        type: activities.type,
        userFk: activities.userFk,
      })
      .from(activities)
      .where(
        and(
          gt(activities.id, floor),
          inArray(activities.regionFk, regions),
          // Nobody is told about their own edit.
          ne(activities.userFk, subscriber.userFk),
        ),
      )
      .orderBy(activities.id)
      // Bounded, because this runs per subscriber every five minutes and `floor` can legitimately
      // be far behind (a fresh account, or somebody who had every category switched off). The
      // digest reports a count and one headline either way, so a longer tail buys nothing.
      .limit(DIGEST_SCAN_LIMIT)

    if (queued.length === 0) {
      return false
    }

    const enabled = queued.filter((activity) => categoryEnabled(activity, subscriber))

    // Rows this person has switched off still count as covered. Leaving them behind the watermark
    // means re-reading a growing prefix on every run and, the moment they switch that category
    // back on, one push announcing the entire backlog.
    if (enabled.length === 0) {
      await advanceWatermark(subscriber.userFk, queued[queued.length - 1].id)
      return false
    }

    const oldest = enabled[0].createdAt.getTime()
    const newest = enabled[enabled.length - 1].createdAt.getTime()
    if (!isDigestDue(oldest, newest, nowMs)) {
      return false
    }

    const actorNames = await namesOf(enabled.map((activity) => activity.userFk))
    const copy = await digestCopy(enabled, actorNames, localeOf(subscriber.contactLocale))
    if (copy == null) {
      return false
    }

    const delivered = await sendPushToUser(subscriptions, subscriber.userFk, {
      badge: unread.get(subscriber.userFk) ?? 0,
      body: copy.body,
      pathname: '/feed',
      // One fixed tag, so a new digest REPLACES the last rather than stacking beside it: a digest
      // is a complete restatement of what is waiting, never an addition to it.
      tag: DIGEST_TAG,
      title: copy.title,
    })

    // Whether or not a device took it, and past everything scanned rather than only what was
    // enabled: an offline phone must not build a backlog that all fires at once later.
    await advanceWatermark(subscriber.userFk, queued[queued.length - 1].id)

    return delivered
  }

  return (await inBatches(subscribers, sendDigest)).filter(Boolean).length
}

/**
 * Directed pushes: one per unread row past its debounce.
 *
 * `readAt IS NULL` is re-read here rather than trusted from when the row was written, and it is
 * what stops a push arriving for something the reader already saw in-app. `pushedAt` is stamped
 * whether or not a device took it, so a person with no working subscription does not accumulate a
 * backlog that fires the day they subscribe.
 */
async function sendDirected(nowMs: number): Promise<number> {
  // `notifications` joins `users` twice over (the recipient carries the settings, the actor
  // carries the name), so the actor side needs an alias of its own.
  const actor = alias(users, 'actor')

  const due = await db
    .select({
      actorName: actor.username,
      contactLocale: userSettings.contactLocale,
      createdAt: notifications.createdAt,
      entityId: notifications.entityId,
      entityType: notifications.entityType,
      id: notifications.id,
      metadata: notifications.metadata,
      notifyDirected: userSettings.notifyDirected,
      regionFk: notifications.regionFk,
      sourceType: notifications.sourceType,
      userFk: notifications.userFk,
    })
    .from(notifications)
    .innerJoin(actor, eq(actor.id, notifications.actorFk))
    .leftJoin(userSettings, eq(userSettings.userFk, notifications.userFk))
    .where(and(isNull(notifications.pushedAt), isNull(notifications.readAt)))

  const ready = due.filter((row) => isDirectedDue(row.createdAt.getTime(), nowMs))
  if (ready.length === 0) {
    return 0
  }

  const wanted = ready.filter((row) => row.notifyDirected !== false)

  // The same re-check the digest half makes, for the same reason. A member removed from the region
  // (or whose role lost `region.read`) between the fan-out and now would otherwise be pushed the
  // name of a route they can no longer open, and find an empty inbox when they tap it: the row's
  // own SELECT policy requires that permission, so it is hidden from the reader it names.
  const regionsByUser = await readableRegions(wanted.map((row) => row.userFk))
  const readable = wanted.filter((row) => regionsByUser.get(row.userFk)?.includes(row.regionFk) === true)

  const subscriptions = await subscriptionsFor(readable.map((row) => row.userFk))
  const unread = await unreadCounts(ready.map((row) => row.userFk))

  const results = await inBatches(readable, (row) => {
    const locale = localeOf(row.contactLocale)
    const view = notificationView(
      {
        actorName: row.actorName,
        entityId: row.entityId,
        entityType: row.entityType,
        metadata: row.metadata ?? undefined,
        sourceType: row.sourceType,
      },
      { locale },
    )

    return sendPushToUser(subscriptions, row.userFk, {
      badge: unread.get(row.userFk) ?? 0,
      pathname: '/notifications',
      tag: directedTag(row.id),
      title: resolveMessage(view.key, view.params, { locale }),
    })
  })

  const sent = results.filter(Boolean).length

  // Every row that was due, not only the ones that went out: a device that is offline or a person
  // with no subscription must not build a queue that all fires at once later.
  await db
    .update(notifications)
    .set({ pushedAt: new Date() })
    .where(
      inArray(
        notifications.id,
        ready.map((row) => row.id),
      ),
    )

  return sent
}

/** Unread inbox rows per person, which is what the app badge shows. Counted here so the service
 *  worker can set it from the payload rather than from however many OS notifications survive. */
async function unreadCounts(userFks: readonly number[]): Promise<Map<number, number>> {
  const ids = [...new Set(userFks)]
  if (ids.length === 0) {
    return new Map()
  }

  const rows = await db
    .select({ total: count(), userFk: notifications.userFk })
    .from(notifications)
    .where(and(inArray(notifications.userFk, ids), isNull(notifications.readAt)))
    .groupBy(notifications.userFk)

  return new Map(rows.map((row) => [row.userFk, row.total]))
}

export const POST: RequestHandler = async ({ request }) => {
  if (!authorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!isPushConfigured()) {
    // Not an error: a dev environment without VAPID keys should say so once per run rather than
    // fail the job and page somebody.
    console.log('[notifications] no VAPID keys configured, nothing sent')
    return json({ configured: false, digests: 0, directed: 0 })
  }

  const nowMs = Date.now()
  // Serially, because both halves read `notifications` and the directed half writes to it.
  const directed = await sendDirected(nowMs)
  const digests = await sendDigests(nowMs)

  console.log(`[notifications] sent ${directed} directed, ${digests} digests`)
  return json({ configured: true, digests, directed })
}
