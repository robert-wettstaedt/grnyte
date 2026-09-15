import { command } from '$app/server'
import { db as baseDb } from '$lib/db/db.server'
import { events, notifications, pushSubscriptions, userSettings } from '$lib/db/schema'
import { writeUserSettings } from '$lib/entities/user/settings.server'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { m } from '$lib/paraglide/messages'
import { baseLocale, isLocale } from '$lib/paraglide/runtime'
import { authedCommand, authedRls } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { error } from '@sveltejs/kit'
import { and, eq, isNull, max, ne, sql } from 'drizzle-orm'
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
 * Move the feed's "how far have I caught up" watermark. The feed acknowledges on every mount.
 *
 * Only ever forward. A scoped feed must not undo the global one, so `greatest` makes the write
 * idempotent rather than making every caller remember the rule.
 *
 * A timestamp, not an id, unlike the `activities` mark it replaces. Event ids do not run with their timestamps (the backfill emitted them in
 * island order), so `greatest(id)` would mark a 2024 card as the newest thing read and silence a
 * digest for everything below it. Millisecond precision, matching `events.created_at`, so a mark
 * taken off a row compares exactly against the rows it is meant to cover.
 */
export const markEventFeedSeen = authedCommand(
  z.object({ seenAt: z.int().check(z.positive()) }),
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
  auth: z.string().check(z.minLength(1)),
  endpoint: z.string().check(z.minLength(1)),
  expirationTime: z.optional(z.nullable(z.number())),
  p256dh: z.string().check(z.minLength(1)),
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
  // endpoint is a string a request can state, and handing a row over on a stated name would
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

  // The ownership check the upsert below does NOT do. `ON CONFLICT (endpoint) DO UPDATE` sets
  // `user_fk` to the caller, and an endpoint is a string a request can state, so once the
  // own-row rule lives here rather than in a policy a caller who names somebody else's endpoint
  // takes their device over: that person silently stops receiving their own pushes, and their
  // browser starts receiving payloads it cannot decrypt.
  //
  // AFTER the pre-delete, never before. The legitimate case is one browser signing in as somebody
  // else, and until that delete runs the endpoint is still owned by the previous account, so a
  // check ordered first would 403 exactly the re-subscribe the pre-delete exists to allow. What
  // survives the delete is an endpoint whose keys the caller could not present, which is a caller
  // naming a device rather than that device coming back.
  //
  // Privileged, because the row belongs to another account: read through `rls` it comes back null
  // and this waves the takeover through, which is the same reason the pre-delete is privileged.
  const endpointOwner = await baseDb.query.pushSubscriptions.findFirst({
    columns: { userFk: true },
    where: eq(pushSubscriptions.endpoint, subscription.endpoint),
  })

  if (endpointOwner != null && endpointOwner.userFk !== user.id) {
    error(403, formError('notifications_pushDeviceTaken'))
  }

  await rls(async (db) => {
    const existing = await db.query.pushSubscriptions.findFirst({
      columns: { id: true },
      where: eq(pushSubscriptions.userFk, user.id),
    })

    // The two owner columns come from the session, never the payload.
    const [written] = await db
      .insert(pushSubscriptions)
      .values({
        auth: subscription.auth,
        authUserFk: user.authUserFk,
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        p256dh: subscription.p256dh,
        userFk: user.id,
      })
      .onConflictDoUpdate({
        set: {
          auth: subscription.auth,
          authUserFk: user.authUserFk,
          expirationTime: subscription.expirationTime,
          p256dh: subscription.p256dh,
          userFk: user.id,
        },
        // The ownership rule again, this time ATOMIC with the write. The check above reads on a
        // different connection outside this transaction, so two concurrent subscribes for the same
        // endpoint can both see it unowned and the loser's `DO UPDATE` would take the row anyway.
        // With this predicate the conflict path only fires on a row that is already the caller's,
        // and a racing takeover degrades to a no-op instead. The check above stays because it is
        // what turns that no-op into a 403 the caller can read.
        // `setWhere`, not `targetWhere`: the latter is the partial-index predicate, this is the
        // condition on the EXISTING row (`push_subscriptions.user_fk = <caller>`).
        setWhere: eq(pushSubscriptions.userFk, user.id),
        target: pushSubscriptions.endpoint,
      })
      .returning({ id: pushSubscriptions.id })

    // Nothing back means `setWhere` suppressed the conflict path and no row was written: this call
    // lost the race the read above cannot see, and the endpoint now belongs to somebody else. Same
    // answer that read gives, rather than falling through to report a subscription that does not
    // exist and stamp watermarks for it.
    if (written == null) {
      error(403, formError('notifications_pushDeviceTaken'))
    }

    if (existing == null) {
      const [{ newest }] = await db.select({ newest: max(events.createdAt) }).from(events)
      // Through the shared writer: a settings row that does not exist yet would otherwise swallow
      // this silently, and the first digest would then count the region's entire history.
      //
      // Both marks, and both as the newest event's TIMESTAMP: the digest counts what is above
      // either, and the pair it counts against is the event one. `to_timestamp(0)` rather than
      // null when the log is empty, because null is what the cron reads as "never initialised".
      await writeUserSettings(db, user, {
        pushedUpToEventAt: newest ?? new Date(0),
        seenUpToEventAt: newest ?? new Date(0),
      })
    }
  })
})

/** Forget this device. Scoped to the caller's own rows by RLS as well as by the predicate. */
export const unsubscribeFromPush = authedCommand(
  z.object({ endpoint: z.string().check(z.minLength(1)) }),
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
  z.object({ endpoint: z.string().check(z.minLength(1)) }),
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
