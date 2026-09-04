/**
 * Feedback alerts for the people who run the app.
 *
 * Not a `notifications` row: every inbox row needs a `region_fk`, and feedback is about the app,
 * not a region. Mirrors `signup.server.ts`.
 *
 * `sendPushToUser` returns false for all three misses (no device, no VAPID keys, every device
 * refused), so the mail fallback is one branch.
 */
import { feedbackAlertEmailContent } from '$lib/email/feedback'
import { sendEmail } from '$lib/email/send.server'
import { contactLocale, resolveMessage } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { appAdminRecipients } from '../notification/adminRecipients.server'
import { sendPushToUser, subscriptionsFor } from '../notification/push.server'
import type { FeedbackKind } from './dto'
import { FEEDBACK_KIND_KEYS } from './mapper'

export interface FeedbackAlertInput {
  excerpt: string
  feedbackFk: number
  kind: FeedbackKind
  /** Absolute origin, so the mail loads its logo from the environment that sent it. */
  origin: string
  /** The route the reporter was on, empty when it was not captured. */
  pathname: string
  username: string
}

/** Never throws: the row is already written, so a report must not be lost to an unreachable host. */
export async function notifyAdminsOfFeedback({
  excerpt,
  feedbackFk,
  kind,
  origin,
  pathname,
  username,
}: FeedbackAlertInput): Promise<void> {
  try {
    const admins = await appAdminRecipients()

    if (admins.length === 0) {
      return
    }

    const subscriptions = await subscriptionsFor(admins.map((admin) => admin.userFk))

    await Promise.all(
      admins.map(async (admin) => {
        const locale = contactLocale(admin.locale)
        const at = { locale }
        const title = m.push_feedbackTitle({ username }, at)

        // One tag per submission, so two reports in a row do not replace one another.
        const pushed = await sendPushToUser(subscriptions, admin.userFk, {
          // Where the tap lands, otherwise the service worker falls back to '/'.
          pathname: '/settings/feedback/inbox',
          tag: `feedback:${feedbackFk}`,
          title,
        })

        if (pushed || admin.email == null) {
          return
        }

        await sendEmail({
          ...feedbackAlertEmailContent({
            excerpt,
            kind: resolveMessage(FEEDBACK_KIND_KEYS[kind], undefined, at),
            locale,
            pathname,
            username,
          }),
          // Stable, so a double submit or a retry mails each admin once.
          idempotencyKey: `feedback-${feedbackFk}-${admin.userFk}`,
          locale,
          origin,
          to: admin.email,
        })
      }),
    )
  } catch (exception) {
    console.error('[feedback] admin alert failed', exception)
  }
}
