import { env as privateEnv } from '$env/dynamic/private'
import { env as publicEnv } from '$env/dynamic/public'
import { PUBLIC_TOPO_EMAIL } from '$env/static/public'
import { db as baseDb } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { pushSubscriptions } from '$lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import type { PushPayload } from './push'

/**
 * Delivery: the one place that talks to a push service, and the one place that knows what a
 * failure from it means about the subscription that caused it.
 *
 * Every send goes through {@link sendPush}, so the two lifecycle rules (a moved endpoint is
 * followed, a dead one is deleted) cannot be forgotten at a call site.
 */

let configured = false

/** Whether push can be sent at all. `check:prod` asserts this for a deployed environment; the
 *  cron reports it rather than failing every run in a dev setup with no keys. */
export function isPushConfigured(): boolean {
  return configure()
}

/**
 * Send one payload to one device, and act on what the push service says about it.
 *
 * - **301** the subscription moved: follow it, or the device stops receiving everything.
 * - **403 / 404 / 410** the subscription is dead: delete it, or every future send retries a
 *   corpse. 403 is the one that matters after a VAPID rotation, where the subscription still
 *   exists at the push service but was signed with a key we no longer hold; the client re-creates
 *   it against the current key, and leaving the stale row would keep failing beside it.
 * - anything else is transient (or ours), so the row is left alone and the send is lost.
 *   A push is not worth a retry queue: the next digest restates the same thing.
 *
 * Returns whether the payload was accepted, so a caller can decide whether to stamp a watermark.
 */
export async function sendPush(
  subscription: Pick<schema.PushSubscription, 'auth' | 'endpoint' | 'expirationTime' | 'id' | 'p256dh'>,
  payload: PushPayload,
): Promise<boolean> {
  if (!configure()) {
    return false
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: { auth: subscription.auth, p256dh: subscription.p256dh },
      },
      JSON.stringify(payload),
    )
    return true
  } catch (exception) {
    if (!(exception instanceof webpush.WebPushError)) {
      console.error('[push] send failed', exception)
      return false
    }

    if (exception.statusCode === 301) {
      await baseDb
        .update(pushSubscriptions)
        .set({ endpoint: exception.endpoint })
        .where(eq(pushSubscriptions.id, subscription.id))
    } else if (exception.statusCode === 403 || exception.statusCode === 404 || exception.statusCode === 410) {
      await baseDb.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
    } else {
      console.error('[push] send rejected', exception.statusCode, exception.body)
    }

    return false
  }
}

/** Send one payload to all of a person's devices. Delivered means at least one device took it,
 *  which is what a watermark should move on: the others are dead or transiently unreachable. */
export async function sendPushToUser(
  subscriptions: readonly schema.PushSubscription[],
  userFk: number,
  payload: PushPayload,
): Promise<boolean> {
  const devices = subscriptions.filter((subscription) => subscription.userFk === userFk)
  const results = await Promise.all(devices.map((device) => sendPush(device, payload)))
  return results.some(Boolean)
}

/**
 * Every device belonging to these people, so the cron reads subscriptions once per run rather
 * than once per recipient.
 */
export function subscriptionsFor(userFks: readonly number[]): Promise<schema.PushSubscription[]> {
  if (userFks.length === 0) {
    return Promise.resolve([])
  }

  return baseDb.query.pushSubscriptions.findMany({ where: inArray(pushSubscriptions.userFk, [...userFks]) })
}

/**
 * Lazily, and only once.
 *
 * Through `$env/dynamic/*` rather than the static imports every other secret uses, because this
 * pair is the one that is legitimately allowed to be absent: a self-hoster who does not want push
 * does not set it, and a static import would refuse to build instead. `isPushConfigured`
 * is what every caller branches on.
 */
function configure(): boolean {
  if (configured) {
    return true
  }

  const publicKey = publicEnv.PUBLIC_VAPID_KEY ?? ''
  const privateKey = privateEnv.PRIVATE_VAPID_KEY ?? ''

  if (publicKey.length === 0 || privateKey.length === 0) {
    return false
  }

  webpush.setVapidDetails(`mailto:${PUBLIC_TOPO_EMAIL}`, publicKey, privateKey)
  configured = true
  return true
}
