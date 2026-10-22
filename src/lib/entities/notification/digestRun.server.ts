import { pinnedTx } from '$lib/db/pinned.server'
import { areas, ascents, blocks, events, files, pushSubscriptions, routes, userSettings } from '$lib/db/schema'
import { eventParentRef } from '$lib/entities/event/mapper'
import { contactLocale } from '$lib/i18n/message'
import { logServerFailure } from '$lib/logging/failure.server'
import { stringifyError } from '$lib/logging/stringify'
import { and, eq, gt, inArray, isNull, lte, max, ne, or, sql } from 'drizzle-orm'
import { toMs, unreadCounts } from './delivery.server'
import { digestCopy } from './digest.server'
import { categoryEnabled, inBatches, safeMark } from './dispatch'
import { readableRegions } from './notification.server'
import { DIGEST_COMMIT_LAG_MS, DIGEST_SCAN_LIMIT, DIGEST_TAG, digestFloor, isDigestDue } from './push'
import { sendPushToUser, subscriptionsFor } from './push.server'

/** The watermark moved forward to `createdAt`, never back. */
const raisedWatermark = (createdAt: Date) =>
  sql`greatest(coalesce(${userSettings.pushedUpToEventAt}, to_timestamp(0)), ${createdAt.toISOString()}::timestamptz)`

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
 * card the reader has genuinely changed moments ago, which is the lesser half of the trade the fold buys
 * everywhere else, and it is why this no longer claims a push never repeats itself.
 */
export async function sendDigests(nowMs: number): Promise<number> {
  // Only people with a device to push to. Everything below is per-recipient, and this is what
  // keeps that work the length of the subscriber list rather than of the user table.
  const subscribers = await pinnedTx((tx) =>
    tx
      .selectDistinct({
        contactLocale: userSettings.contactLocale,
        notifyAscents: userSettings.notifyAscents,
        notifyCommunity: userSettings.notifyCommunity,
        notifyGuidebookEdits: userSettings.notifyGuidebookEdits,
        pushedUpTo: userSettings.pushedUpToEventAt,
        seenUpTo: userSettings.seenUpToEventAt,
        userFk: pushSubscriptions.userFk,
      })
      .from(pushSubscriptions)
      // INNER, not LEFT. A subscriber with no `user_settings` row has no watermark to move, and an
      // UPDATE against a row that does not exist affects nothing and reports success, which would
      // make the same digest go out every five minutes, forever. `subscribeToPush` creates the row,
      // so this only skips accounts whose settings went missing, and only until they touch settings.
      .innerJoin(userSettings, eq(userSettings.userFk, pushSubscriptions.userFk)),
  )

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
  const [{ newestEventAt }] = await pinnedTx((tx) => tx.select({ newestEventAt: max(events.createdAt) }).from(events))

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

    const rows = await pinnedTx((tx) =>
      tx
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
            // Nobody is told about their own edit; a deleted actor's still counts.
            or(isNull(events.actorFk), ne(events.actorFk, subscriber.userFk)),
          ),
        )
        .orderBy(events.createdAt, events.id)
        // Bounded, because this runs per subscriber every five minutes and `floor` can legitimately
        // be far behind (a fresh account, or somebody who had every category switched off). The
        // digest reports a count and one headline either way, so a longer tail buys nothing.
        .limit(DIGEST_SCAN_LIMIT),
    )

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

    // Rows this person has switched off still count as covered. Leaving them behind the watermark
    // means re-reading a growing prefix on every run and, the moment they switch that category
    // back on, one push announcing the entire backlog.
    const mark = safeMark(queued, queued.length === DIGEST_SCAN_LIMIT)
    // Only what the mark covers: rows a truncated scan defers are counted by the run that covers them.
    const enabled = queued.filter(
      (event) => event.createdAt.getTime() <= mark.getTime() && categoryEnabled(event, subscriber),
    )

    if (enabled.length === 0) {
      await advanceWatermark(subscriber.userFk, mark)
      return false
    }

    const oldest = enabled[0].createdAt.getTime()
    const newest = enabled[enabled.length - 1].createdAt.getTime()
    if (!isDigestDue(oldest, newest, nowMs)) {
      return false
    }

    const actorNames = await namesOf(enabled.flatMap((event) => (event.actorFk == null ? [] : [event.actorFk])))
    const copy = await digestCopy(enabled, actorNames, contactLocale(subscriber.contactLocale))
    if (copy == null) {
      return false
    }

    // Claimed before the push so an overlapping run sends once, and past everything scanned so an
    // offline phone builds no backlog that fires all at once later.
    if (!(await claimWatermark(subscriber.userFk, subscriber.pushedUpTo, mark))) {
      return false
    }

    return sendPushToUser(subscriptions, subscriber.userFk, {
      badge: unread.get(subscriber.userFk) ?? 0,
      body: copy.body,
      pathname: '/feed',
      // One fixed tag, so a new digest REPLACES the last rather than stacking beside it: a digest
      // is a complete restatement of what is waiting, never an addition to it.
      tag: DIGEST_TAG,
      title: copy.title,
    })
  }

  // Per subscriber, because `inBatches` runs a bare `Promise.all`: one person whose digest throws
  // (a malformed row, a query that times out) would otherwise take down the whole run, and every
  // run after it, leaving everybody behind them in the list with no push at all.
  const guarded = async (subscriber: (typeof subscribers)[number]): Promise<boolean> => {
    try {
      return await sendDigest(subscriber)
    } catch (error) {
      console.error(`[notifications] digest failed for user ${subscriber.userFk}`, error)
      await logServerFailure('notifications', `digest failed for user ${subscriber.userFk}: ${stringifyError(error)}`)
      return false
    }
  }

  return (await inBatches(subscribers, guarded)).filter(Boolean).length
}

/** Move a person's push watermark forward, never back. A timestamp, matching `events.created_at`. */
async function advanceWatermark(userFk: number, createdAt: Date): Promise<void> {
  await pinnedTx((tx) =>
    tx
      .update(userSettings)
      .set({
        pushedUpToEventAt: raisedWatermark(createdAt),
      })
      .where(eq(userSettings.userFk, userFk)),
  )
}

/**
 * {@link advanceWatermark}, but only if the mark is still the one this run read: whether this run
 * won the right to send the digest it computed. An overlapping run that read the same mark loses.
 */
async function claimWatermark(userFk: number, expected: Date | null, createdAt: Date): Promise<boolean> {
  const claimed = await pinnedTx((tx) =>
    tx
      .update(userSettings)
      .set({
        pushedUpToEventAt: raisedWatermark(createdAt),
      })
      .where(
        and(
          eq(userSettings.userFk, userFk),
          sql`${toMs(userSettings.pushedUpToEventAt)} is not distinct from ${expected?.toISOString() ?? null}::timestamptz`,
        ),
      )
      .returning({ userFk: userSettings.userFk }),
  )
  return claimed.length > 0
}

/** Usernames by id, for the digest headline's actor slot. */
async function namesOf(userFks: readonly number[]): Promise<Map<number, string>> {
  const ids = [...new Set(userFks)]
  if (ids.length === 0) {
    return new Map()
  }

  const rows = await pinnedTx((tx) =>
    tx.query.users.findMany({
      columns: { id: true, username: true },
      where: (table, { inArray: within }) => within(table.id, ids),
    }),
  )

  return new Map(rows.map((row) => [row.id, row.username]))
}
