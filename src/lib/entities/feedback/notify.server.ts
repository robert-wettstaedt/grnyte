/**
 * Feedback alerts for the people who run the app.
 *
 * Not a `notifications` row: every inbox row needs a `region_fk`, and feedback is about the app,
 * not a region. Mirrors `signup.server.ts`.
 */
import { feedbackAlertEmailContent } from '$lib/email/feedback'
import { resolveMessage } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { alertAppAdmins } from '../notification/adminAlert.server'
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
  await alertAppAdmins({
    email: ({ admin, at, locale }) => ({
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
    }),
    label: 'feedback',
    // One tag per submission, so two reports in a row do not replace one another.
    push: ({ at }) => ({
      // Where the tap lands, otherwise the service worker falls back to '/'.
      pathname: '/settings/feedback/inbox',
      tag: `feedback:${feedbackFk}`,
      title: m.push_feedbackTitle({ username }, at),
    }),
  })
}
