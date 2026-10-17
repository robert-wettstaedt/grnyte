import { dev } from '$app/environment'
import { sendDigests } from '$lib/entities/notification/digestRun.server'
import { sendDirected } from '$lib/entities/notification/directed.server'
import { alertOnNewErrors } from '$lib/entities/notification/errorAlert.server'
import { isPushConfigured } from '$lib/entities/notification/push.server'
import { isCronAuthorized } from '$lib/remote/cron.server'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/**
 * The push cron. Driven by pg_cron every five minutes, gated by the same `x-api-key` as
 * `/api/tasks/cleanup`.
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
 * Nothing in this repo schedules it, exactly like `/api/tasks/cleanup`: pg_cron lives in
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

export const POST: RequestHandler = async ({ request, url }) => {
  if (!isCronAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const configured = isPushConfigured()

  if (!configured) {
    // Not an error, and no longer a reason to stop: the membership half of `sendDirected` goes out
    // by MAIL, whose secret is a different one. An environment with Resend configured and VAPID
    // not (a staging box, a key rotation) still owes people the sentence about their own
    // membership, and `sendDirected` stamps only what it dispatched, so everything it
    // could not push is still waiting when the keys appear.
    console.log('[notifications] no VAPID keys configured, sending mail only')
  }

  const nowMs = Date.now()
  // Serially, because both halves read `notifications` and the directed half writes to it.
  // The deployment's own origin, which is what the pg_cron caller posted to. No env var for it:
  // the mail's logo and CTA then follow whichever environment ran the job.
  const directed = await sendDirected(nowMs, url.origin, configured)
  // Nothing to do without push: a digest has no second channel, and running it anyway would
  // advance everybody's watermark past events nobody was told about.
  const digests = configured ? await sendDigests(nowMs) : 0

  const errors = dev ? 0 : await alertOnNewErrors(url.origin)

  console.log(`[notifications] sent ${directed} directed, ${digests} digests, ${errors} error alerts`)
  return json({ configured, digests, directed, errors })
}
