import { CRON_API_KEY } from '$env/static/private'
import { db } from '$lib/db/db.server'
import {
  areas,
  ascents,
  blocks,
  events,
  files,
  notifications,
  pushSubscriptions,
  routes,
  users,
  userSettings,
} from '$lib/db/schema'
import { isAscentEvent, objectOf } from '$lib/entities/event/dto'
import { eventParentRef } from '$lib/entities/event/mapper'
import { notificationView } from '$lib/entities/notification/caption'
import { digestCopy, type DigestEvent } from '$lib/entities/notification/digest.server'
import { readableRegions } from '$lib/entities/notification/notification.server'
import {
  DIGEST_COMMIT_LAG_MS,
  DIGEST_SCAN_LIMIT,
  DIGEST_TAG,
  digestFloor,
  directedTag,
  isDigestDue,
  isDirectedDue,
} from '$lib/entities/notification/push'
import { isPushConfigured, sendPushToUser, subscriptionsFor } from '$lib/entities/notification/push.server'
import { contactLocale, resolveMessage } from '$lib/i18n/message'
import { json } from '@sveltejs/kit'
import { and, count, eq, gt, inArray, isNull, lte, max, ne, sql } from 'drizzle-orm'
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

/** Move a person's push watermark forward, never back. A timestamp, matching `events.created_at`. */
async function advanceWatermark(userFk: number, createdAt: Date): Promise<void> {
  await db
    .update(userSettings)
    .set({
      pushedUpToEventAt: sql`greatest(coalesce(${userSettings.pushedUpToEventAt}, to_timestamp(0)), ${createdAt})`,
    })
    .where(eq(userSettings.userFk, userFk))
}

/** Which switch governs an event. Everything that is not an ascent or a person is a crag edit,
 *  which is what `notify_moderations` always actually meant before it was renamed. */
function categoryEnabled(
  event: Pick<DigestEvent, 'ascentFk' | 'subjectFk' | 'verb'>,
  settings: { notifyAscents: boolean | null; notifyCommunity: boolean | null; notifyCragEdits: boolean | null },
): boolean {
  if (isAscentEvent({ ascent: event.ascentFk != null, verb: event.verb })) {
    return settings.notifyAscents !== false
  }

  if (event.subjectFk != null) {
    return settings.notifyCommunity !== false
  }

  return settings.notifyCragEdits !== false
}

/**
 * Whether this person wants a push for this row.
 *
 * A reaction and a comment have switches of their own, because they arrive at a different rhythm
 * than the rest of the directed half: a busy card can produce several in an evening, and somebody
 * who wants to hear about a mention on their ascent may not want to hear about every 👍. Anything
 * else is `notifyDirected`, which is the switch it always was.
 *
 * Only PUSH. Every one of these rows is in the inbox whatever the switches say.
 */
function directedWanted(row: {
  notifyComments: boolean | null
  notifyDirected: boolean | null
  notifyReactions: boolean | null
  sourceType: string
}): boolean {
  if (row.sourceType === 'reaction') {
    return row.notifyReactions !== false
  }

  // A reply is a comment somebody aimed at you, so it answers to the comment switch rather than
  // to a third one nobody would think to look for.
  if (row.sourceType === 'comment' || row.sourceType === 'comment_reply') {
    return row.notifyComments !== false
  }

  return row.notifyDirected !== false
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
 * Where a directed push opens.
 *
 * A literal path rather than SvelteKit's `resolve`: this runs in a task route with no page
 * context, and the service worker hands whatever is here to `clients.openWindow`. It must stay in
 * step with `/(app)/(shell)/events/[id]`, which is one route and has no other callers server-side.
 */
function pathnameFor(row: { eventFk: null | number; reactionFk: null | number }): string {
  if (row.eventFk == null) {
    return '/notifications'
  }

  return `/events/${row.eventFk}${row.reactionFk == null ? '' : `?comment=${row.reactionFk}`}`
}

/**
 * How far a scan may safely mark, given `created_at` is not unique.
 *
 * A full scan can cut inside a group of events sharing one millisecond, and the mark is a
 * timestamp: advancing to the last row's would put the tied siblings below it forever. So a
 * truncated scan stops at the last row BEFORE the trailing tie group, which is then re-read next
 * run. The one case that cannot be handled that way is a whole window of one millisecond, where
 * stopping short would never advance at all; there the tie is taken whole, which is the lesser
 * failure (a repeat, not a silence) and needs 500 events inside one millisecond to reach.
 */
function safeMark(scanned: readonly { createdAt: Date }[], truncated: boolean): Date {
  const last = scanned[scanned.length - 1].createdAt

  if (!truncated) {
    return last
  }

  const kept = scanned.filter((row) => row.createdAt.getTime() !== last.getTime())
  return kept.length === 0 ? last : kept[kept.length - 1].createdAt
}

/**
 * The digest: for each subscriber, whatever region activity has landed above both watermarks.
 *
 * `greatest(pushedUpTo, seenUpTo)` is the floor, so catching up in the feed silences the push for
 * what was read. The watermark moves whether or not a device took the payload, for the same reason
 * the directed half stamps `pushedAt` unconditionally.
 *
 * One thing a timestamp floor cannot promise that the old id one could: an event whose author
 * keeps editing it inside the 15-minute fold window has its `created_at` bumped by the fold, so an
 * event already counted can rise back above the mark and be counted again. That is one repeat of a
 * card the reader has genuinely just changed, which is the lesser half of the trade the fold buys
 * everywhere else, and it is why this no longer claims a push never repeats itself.
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
      pushedUpTo: userSettings.pushedUpToEventAt,
      seenUpTo: userSettings.seenUpToEventAt,
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
  // Membership alone is not the rule: the `events` SELECT policy also requires a role that
  // holds `region.read`, and a digest naming entities the reader cannot open would be worse than
  // no digest. Once for the batch, because asking per subscriber was a round trip each before the
  // scan below had even started.
  const regionsByUser = await readableRegions(userFks)
  // The starting line for anybody who has never had a watermark, see below.
  const [{ newestEventAt }] = await db.select({ newestEventAt: max(events.createdAt) }).from(events)

  const sendDigest = async (subscriber: (typeof subscribers)[number]): Promise<boolean> => {
    // Both marks null means never initialised, which is NOT the same as "caught up to nothing":
    // `digestFloor` reads it as 0, and this person would be pushed the region's entire history 500
    // events at a time, once per run, until it caught up. `subscribeToPush` seeds the marks on
    // a FIRST subscription, so the accounts that land here are the ones that already had one when
    // their settings row appeared: everybody who carried a 1.0 subscription across, and anybody
    // whose settings row is created afterwards by a writer that is not `subscribeToPush`. First
    // sight is the starting line, exactly as it is for a new subscriber, and it is the only floor
    // those accounts get: no migration seeds the mark for them.
    if (subscriber.pushedUpTo == null && subscriber.seenUpTo == null) {
      await advanceWatermark(subscriber.userFk, newestEventAt ?? new Date(0))
      return false
    }

    const floor = new Date(digestFloor(subscriber.pushedUpTo?.getTime(), subscriber.seenUpTo?.getTime()))
    const regions = regionsByUser.get(subscriber.userFk) ?? []

    if (regions.length === 0) {
      return false
    }

    const rows = await db
      .select({
        actorFk: events.actorFk,
        areaFk: events.areaFk,
        // The eight fks the parent hop reads, handed to `eventParentRef` below rather than
        // resolved in SQL. What a burst groups on has to be the hop the FEED reads, and a
        // `coalesce` and a `case` kept in step with it by hand is a push that groups differently
        // from the cards it summarises. Without a parent at all, every edit under one block is its
        // own group, which inflates the "and 12 more" the digest reports.
        areaParentFk: areas.parentFk,
        // When it was climbed, which is not when it was logged. `groupEvents` ends a session card
        // at the climb day, so a digest without this counts a card the feed never draws.
        ascentClimbedAt: ascents.dateTime,
        ascentFk: events.ascentFk,
        ascentRouteFk: ascents.routeFk,
        // The catalogue keys a logged ascent on its type, which is a column of the ascent rather
        // than of the event. Without it every send in a digest reads as the generic sentence.
        ascentType: ascents.type,
        blockAreaFk: blocks.areaFk,
        blockFk: events.blockFk,
        // The first column an update moved, which is what the catalogue keys the sentence on: an
        // update carries no verb of its own beyond "update", so without this a grade change reads
        // as "edited the route" and a file or membership edit falls all the way through to the
        // generic sentence.
        changedColumn: sql<
          null | string
        >`(select c.column_name from public.changes c where c.event_fk = ${events.id} order by c.id limit 1)`,
        createdAt: events.createdAt,
        fileAreaFk: files.areaFk,
        fileAscentFk: files.ascentFk,
        fileBlockFk: files.blockFk,
        fileFk: events.fileFk,
        fileRouteFk: files.routeFk,
        id: events.id,
        metadata: events.metadata,
        regionFk: events.regionFk,
        routeBlockFk: routes.blockFk,
        routeFk: events.routeFk,
        subjectFk: events.subjectFk,
        verb: events.verb,
      })
      .from(events)
      // All on primary keys, and `events_one_object` allows at most one of them to match, so none
      // of these can multiply a row.
      .leftJoin(areas, eq(areas.id, events.areaFk))
      .leftJoin(ascents, eq(ascents.id, events.ascentFk))
      .leftJoin(blocks, eq(blocks.id, events.blockFk))
      .leftJoin(files, eq(files.id, events.fileFk))
      .leftJoin(routes, eq(routes.id, events.routeFk))
      .where(
        and(
          gt(events.createdAt, floor),
          // Stops short of the last half minute: a row is stamped when it is written and visible
          // only when its transaction commits, so reading right up to now would let the mark step
          // over something still in flight. See `DIGEST_COMMIT_LAG_MS`.
          lte(events.createdAt, new Date(nowMs - DIGEST_COMMIT_LAG_MS)),
          inArray(events.regionFk, regions),
          // Nobody is told about their own edit.
          ne(events.actorFk, subscriber.userFk),
        ),
      )
      .orderBy(events.createdAt, events.id)
      // Bounded, because this runs per subscriber every five minutes and `floor` can legitimately
      // be far behind (a fresh account, or somebody who had every category switched off). The
      // digest reports a count and one headline either way, so a longer tail buys nothing.
      .limit(DIGEST_SCAN_LIMIT)

    if (rows.length === 0) {
      return false
    }

    // The parent, resolved by the same function the feed's mapper calls.
    const queued = rows.map(
      ({
        areaParentFk,
        ascentRouteFk,
        blockAreaFk,
        fileAreaFk,
        fileAscentFk,
        fileBlockFk,
        fileRouteFk,
        routeBlockFk,
        ...event
      }) => {
        const parent = eventParentRef({
          areaParentFk,
          ascentRouteFk,
          blockAreaFk,
          file:
            event.fileFk == null
              ? undefined
              : { areaFk: fileAreaFk, ascentFk: fileAscentFk, blockFk: fileBlockFk, routeFk: fileRouteFk },
          routeBlockFk,
        })

        return { ...event, parentId: parent?.id, parentType: parent?.type }
      },
    )

    const enabled = queued.filter((event) => categoryEnabled(event, subscriber))

    // Rows this person has switched off still count as covered. Leaving them behind the watermark
    // means re-reading a growing prefix on every run and, the moment they switch that category
    // back on, one push announcing the entire backlog.
    const mark = safeMark(queued, queued.length === DIGEST_SCAN_LIMIT)

    if (enabled.length === 0) {
      await advanceWatermark(subscriber.userFk, mark)
      return false
    }

    const oldest = enabled[0].createdAt.getTime()
    const newest = enabled[enabled.length - 1].createdAt.getTime()
    if (!isDigestDue(oldest, newest, nowMs)) {
      return false
    }

    const actorNames = await namesOf(enabled.map((event) => event.actorFk))
    const copy = await digestCopy(enabled, actorNames, contactLocale(subscriber.contactLocale))
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
    await advanceWatermark(subscriber.userFk, mark)

    return delivered
  }

  // Per subscriber, because `inBatches` runs a bare `Promise.all`: one person whose digest throws
  // (a malformed row, a query that times out) would otherwise take down the whole run, and every
  // run after it, leaving everybody behind them in the list with no push at all.
  const guarded = async (subscriber: (typeof subscribers)[number]): Promise<boolean> => {
    try {
      return await sendDigest(subscriber)
    } catch (error) {
      console.error(`[notifications] digest failed for user ${subscriber.userFk}`, error)
      return false
    }
  }

  return (await inBatches(subscribers, guarded)).filter(Boolean).length
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
      areaFk: notifications.areaFk,
      ascentFk: notifications.ascentFk,
      blockFk: notifications.blockFk,
      contactLocale: userSettings.contactLocale,
      createdAt: notifications.createdAt,
      // Both only so the push can open where it happened rather than on the inbox. See
      // `pathnameFor`.
      eventFk: notifications.eventFk,
      fileFk: notifications.fileFk,
      id: notifications.id,
      metadata: notifications.metadata,
      notifyComments: userSettings.notifyComments,
      notifyDirected: userSettings.notifyDirected,
      notifyReactions: userSettings.notifyReactions,
      reactionFk: notifications.reactionFk,
      regionFk: notifications.regionFk,
      routeFk: notifications.routeFk,
      sourceType: notifications.sourceType,
      subjectFk: notifications.subjectFk,
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

  const wanted = ready.filter(directedWanted)

  // The same re-check the digest half makes, for the same reason. A member removed from the region
  // (or whose role lost `region.read`) between the fan-out and now would otherwise be pushed the
  // name of a route they can no longer open, and find an empty inbox when they tap it: the row's
  // own SELECT policy requires that permission, so it is hidden from the reader it names.
  const regionsByUser = await readableRegions(wanted.map((row) => row.userFk))
  const readable = wanted.filter((row) => regionsByUser.get(row.userFk)?.includes(row.regionFk) === true)

  const subscriptions = await subscriptionsFor(readable.map((row) => row.userFk))
  const unread = await unreadCounts(ready.map((row) => row.userFk))

  const results = await inBatches(readable, (row) => {
    const locale = contactLocale(row.contactLocale)
    const view = notificationView(
      {
        actorName: row.actorName,
        metadata: row.metadata ?? undefined,
        // The same derivation the inbox makes: whichever typed column is set says what the row is
        // about. The push only needs it for the sentence, which never asks what type it was.
        object: objectOf(row),
        sourceType: row.sourceType,
      },
      { locale },
    )

    return sendPushToUser(subscriptions, row.userFk, {
      badge: unread.get(row.userFk) ?? 0,
      // Straight to where it happened when the row knows: a comment, a reply, a mention inside one
      // and an emoji all name their card, and the card's page renders the thread with the line
      // anchored. Everything else lands on the inbox, which is the only thing it could say.
      pathname: pathnameFor(row),
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
