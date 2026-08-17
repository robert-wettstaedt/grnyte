import { command } from '$app/server'
import { db as baseDb } from '$lib/db/db.server'
import { activities, notifications, pushSubscriptions, userSettings } from '$lib/db/schema'
import { writeUserSettings } from '$lib/entities/user/settings.server'
import { m } from '$lib/paraglide/messages'
import { baseLocale, isLocale } from '$lib/paraglide/runtime'
import { authedCommand, authedRls } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { and, eq, isNull, max, ne, sql } from 'drizzle-orm'
import z from 'zod'
import { DIGEST_TAG } from './push'
import { sendPush } from './push.server'

/**
 * Mark the caller's whole inbox read. Called once when `/notifications` mounts.
 *
 * Deliberately everything rather than the rows currently listed: the list is bounded (the query
 * caps at 50), and per-item read state would mean an inbox whose badge disagrees with what is on
 * screen. Opening the inbox is the act of reading it.
 *
 * Runs on the caller's RLS transaction, where `users can update own notifications` is the gate,
 * so the `auth_user_fk` predicate is the policy's rather than this handler's.
 */
export const markNotificationsRead = authedCommand(z.void(), async (_, { db, user }) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userFk, user.id), isNull(notifications.readAt)))
})

/**
 * Move the feed's "how far have I caught up" watermark.
 *
 * Only ever forward. The feed acknowledges on every mount, and a scoped feed that somehow reached
 * here with a lower id must not undo a global one; `greatest` makes the write idempotent rather
 * than making every caller remember the rule.
 */
export const markFeedSeen = authedCommand(
  // `.int()` because the value ends up inside `greatest(...)` against an int4 column, and a float
  // or an id past 2^31 turns a settings write into a Postgres 22003 rather than a no-op.
  z.object({ activityId: z.number().int().positive() }),
  async ({ activityId }, { db, user }) => {
    // Through the shared writer, which creates the row when it is missing. A plain UPDATE against
    // an account with no settings row affects nothing and reports success, and a watermark that
    // never moves is a digest that repeats itself every five minutes.
    await writeUserSettings(db, user, {
      seenUpToActivityId: sql`greatest(coalesce(${userSettings.seenUpToActivityId}, 0), ${activityId})`,
    })
  },
)

/**
 * The event-log twin of {@link markFeedSeen}.
 *
 * A timestamp, not an id. Event ids do not run with their timestamps (the backfill emitted them in
 * island order), so `greatest(id)` would mark a 2024 card as the newest thing read and silence a
 * digest for everything below it. Millisecond precision, matching `events.created_at`, so a mark
 * taken off a row compares exactly against the rows it is meant to cover.
 */
export const markEventFeedSeen = authedCommand(
  z.object({ seenAt: z.number().int().positive() }),
  async ({ seenAt }, { db, user }) => {
    // Through the shared writer for the same reason: a plain UPDATE against an account with no
    // settings row affects nothing and reports success, and a watermark that never moves is a
    // digest that repeats itself every five minutes.
    await writeUserSettings(db, user, {
      seenUpToEventAt: sql`greatest(coalesce(${userSettings.seenUpToEventAt}, to_timestamp(0)), to_timestamp(${seenAt} / 1000.0))`,
    })
  },
)

/** What `PushManager.subscribe` hands back, narrowed to what a send needs. */
const subscriptionSchema = z.object({
  auth: z.string().min(1),
  endpoint: z.string().min(1),
  expirationTime: z.number().nullable().optional(),
  p256dh: z.string().min(1),
})

/**
 * Register this device for push.
 *
 * Keyed on the endpoint, which IS the device: a re-subscribe (a service worker update, a
 * component remount, a key rotation) has to replace the row rather than add a second one, or that
 * device receives one copy of every push per row it accumulated.
 *
 * Also initialises the broadcast watermarks, on the FIRST subscription only. Without that a
 * brand-new subscriber's first digest counts the region's entire history and reads "4,812
 * updates". Only the first, so adding a second device does not silently mark the first one's
 * backlog as delivered.
 */
export const subscribeToPush = command(subscriptionSchema, async (subscription) => {
  const { rls, user } = await authedRls()

  // An endpoint is a BROWSER, not an account. Sign out, sign in as somebody else, and the same
  // endpoint comes back owned by the previous account: a row RLS hides from the new caller, so an
  // upsert against it raises a unique violation instead of taking it over, and that account is
  // left receiving somebody else's digests.
  //
  // Matched on the subscription's KEYS as well as its endpoint, never the endpoint alone. An
  // endpoint is a string a request can simply state, and handing a row over on a stated name would
  // let any caller move somebody else's device onto their own account: that person silently stops
  // receiving their own pushes, and their browser starts receiving payloads it cannot decrypt.
  // `auth` is the browser's own 16-byte secret, so presenting the pair the stored row holds is
  // proof this is that device coming back rather than a caller naming it.
  //
  // Privileged, and BEFORE the insert on its own connection, which is why this is not an
  // authedCommand: deferring it to `afterCommit` would run it after the insert it exists to make
  // possible, and nesting it inside the handler's transaction would take a second connection out
  // of the same ten-slot pool.
  await baseDb
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, subscription.endpoint),
        eq(pushSubscriptions.auth, subscription.auth),
        eq(pushSubscriptions.p256dh, subscription.p256dh),
        ne(pushSubscriptions.userFk, user.id),
      ),
    )

  await rls(async (db) => {
    const existing = await db.query.pushSubscriptions.findFirst({
      columns: { id: true },
      where: eq(pushSubscriptions.userFk, user.id),
    })

    await db
      .insert(pushSubscriptions)
      .values({ ...subscription, authUserFk: user.authUserFk, userFk: user.id })
      .onConflictDoUpdate({
        set: {
          auth: subscription.auth,
          authUserFk: user.authUserFk,
          expirationTime: subscription.expirationTime,
          p256dh: subscription.p256dh,
          userFk: user.id,
        },
        target: pushSubscriptions.endpoint,
      })

    if (existing == null) {
      const [{ newest }] = await db.select({ newest: max(activities.id) }).from(activities)
      // Through the shared writer: a settings row that does not exist yet would otherwise swallow
      // this silently, and the first digest would then count the region's entire history.
      await writeUserSettings(db, user, { pushedUpToActivityId: newest ?? 0, seenUpToActivityId: newest ?? 0 })
    }
  })
})

/** Forget this device. Scoped to the caller's own rows by RLS as well as by the predicate. */
export const unsubscribeFromPush = authedCommand(
  z.object({ endpoint: z.string().min(1) }),
  async ({ endpoint }, { db, user }) => {
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userFk, user.id)))
  },
)

/**
 * Send one push to this device, now.
 *
 * The only practical way to debug an installed iOS PWA, where a broken subscription and a working
 * one with nothing to send look exactly alike. Deliberately synchronous and deliberately reports
 * failure, unlike the cron, which is best effort: here the failure IS the answer.
 */
export const sendTestPush = command(
  z.object({ endpoint: z.string().min(1) }),
  async ({ endpoint }): Promise<MutationResult<{ delivered: boolean }>> => {
    // Not an authedCommand: `sendPush` follows a moved endpoint and deletes a dead one on the
    // privileged handle, so it needs a connection of its own, and taking one while an
    // authedCommand transaction holds another out of the same pool is what deadlocks it. It cannot
    // be `afterCommit` work either, because whether the send worked IS this command's answer.
    const { rls, user } = await authedRls()

    const found = await rls(async (db) => {
      const subscription = await db.query.pushSubscriptions.findFirst({
        where: and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userFk, user.id)),
      })
      const settings = await db.query.userSettings.findFirst({
        columns: { contactLocale: true },
        where: eq(userSettings.userFk, user.id),
      })
      return { settings, subscription }
    })

    if (found.subscription == null) {
      return { data: { delivered: false } }
    }

    const stored = found.settings?.contactLocale
    const locale = stored != null && isLocale(stored) ? stored : baseLocale

    const delivered = await sendPush(found.subscription, {
      body: m.push_testBody({}, { locale }),
      pathname: '/settings',
      // The digest tag on purpose: a test replaces whatever digest is on screen rather than
      // stacking beside it, which is also the behaviour it is there to demonstrate.
      tag: DIGEST_TAG,
      title: m.push_testTitle({}, { locale }),
    })

    return { data: { delivered } }
  },
)
