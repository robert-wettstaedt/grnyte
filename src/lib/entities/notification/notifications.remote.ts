import { command } from '$app/server'
import { pushSubscriptions, userSettings } from '$lib/db/schema'
import { m } from '$lib/paraglide/messages'
import { baseLocale, isLocale } from '$lib/paraglide/runtime'
import { authedRls } from '$lib/remote/authed.server'
import type { MutationResult } from '$lib/remote/mutation'
import { and, eq } from 'drizzle-orm'
import { endpointSchema } from './dto'
import { DIGEST_TAG } from './push'
import { notePushFailure, sendPush } from './push.server'

/**
 * Send one push to this device, now.
 *
 * The only practical way to debug an installed iOS PWA, where a broken subscription and a working
 * one with nothing to send look exactly alike. Deliberately synchronous and deliberately reports
 * failure, unlike the cron, which is best effort: here the failure IS the answer.
 */
export const sendTestPush = command(
  endpointSchema,
  // fallow-ignore-next-line complexity -- CRAP only: no suite drives a real push send
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
