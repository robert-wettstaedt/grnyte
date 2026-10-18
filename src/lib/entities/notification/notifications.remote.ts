import { command } from '$app/server'
import { applyRls } from '$lib/db/db.server'
import { pinnedTx } from '$lib/db/pinned.server'
import { pushSubscriptions, userSettings } from '$lib/db/schema'
import * as z from '$lib/forms/zod'
import { m } from '$lib/paraglide/messages'
import { baseLocale, isLocale } from '$lib/paraglide/runtime'
import { authedCommand, authedRls, requireAuthed } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { and, eq } from 'drizzle-orm'
import { endpointSchema, subscriptionSchema } from './dto'
import {
  markEventFeedSeenRow,
  markNotificationsReadRow,
  subscribeToPushRow,
  unsubscribeFromPushRow,
} from './inbox.server'
import { DIGEST_TAG } from './push'
import { notePushFailure, sendPush } from './push.server'

// The bodies live in `inbox.server.ts`, shared with the notification mutators; these stay one
// release so tabs loaded before the mutators keep their endpoints.

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const markNotificationsRead = authedCommand(z.void(), (_, ctx) => markNotificationsReadRow(ctx))

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const markEventFeedSeen = authedCommand(z.object({ seenAt: z.int().check(z.positive()) }), (args, ctx) =>
  markEventFeedSeenRow(args, ctx),
)

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const subscribeToPush = command(subscriptionSchema, (subscription) => {
  const { claims, user } = requireAuthed()
  return pinnedTx((db) => subscribeToPushRow(subscription, { db, dropToCaller: () => applyRls(db, claims), user }))
})

/** @public Unused since the mutators; deployed one more release for tabs loaded before them. */
export const unsubscribeFromPush = authedCommand(endpointSchema, (args, ctx) => unsubscribeFromPushRow(args, ctx))

/**
 * Send one push to this device, now.
 *
 * The only practical way to debug an installed iOS PWA, where a broken subscription and a working
 * one with nothing to send look exactly alike. Deliberately synchronous and deliberately reports
 * failure, unlike the cron, which is best effort: here the failure IS the answer.
 */
export const sendTestPush = command(
  endpointSchema,
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
      // The device believes it is subscribed and the server holds no row for it: the one failure
      // here that no send is ever attempted for, so nothing else would record it. Named by user,
      // since there is no subscription to name and the dedupe would otherwise collapse everyone's.
      await notePushFailure(`test not sent: no subscription stored for user ${user.id}`, endpoint)
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
