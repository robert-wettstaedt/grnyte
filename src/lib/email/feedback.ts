import { m } from '$lib/paraglide/messages'
import type { EmailContent, EmailLocale } from './shell'

export interface FeedbackAlertEmailInput {
  /** First line only, this goes in a subject. */
  excerpt: string
  /** Already resolved in the recipient's language. */
  kind: string
  /** The RECIPIENT's locale, never the ambient one. */
  locale: EmailLocale
  /** Empty when it was not captured. */
  pathname: string
  username: string
}

export interface FeedbackReplyEmailInput {
  /** The RECIPIENT's locale, never the ambient one. */
  locale: EmailLocale
  /** Quoted back so the answer stands on its own weeks later. */
  original: string
  reply: string
  url: string
}

/** Excerpt and route only: enough to decide whether to open the inbox now or later. */
export function feedbackAlertEmailContent({
  excerpt,
  kind,
  locale,
  pathname,
  username,
}: FeedbackAlertEmailInput): EmailContent {
  const at = { locale }

  return {
    body: [
      m.email_feedbackAlertBody1({ kind, username }, at),
      excerpt,
      ...(pathname.length === 0 ? [] : [m.email_feedbackAlertBody2({ pathname }, at)]),
    ],
    footerReason: 'account',
    meta: m.email_feedbackAlertMeta({}, at),
    preheader: m.email_feedbackAlertPreheader({ username }, at),
    subject: m.email_feedbackAlertSubject({ username }, at),
    title: m.email_feedbackAlertTitle({ username }, at),
  }
}

/** The delivery itself, not a notice: over 90% of accounts have no push subscription. */
export function feedbackReplyEmailContent({ locale, original, reply, url }: FeedbackReplyEmailInput): EmailContent {
  const at = { locale }

  return {
    action: { label: m.email_openApp({}, at), url },
    body: [reply, m.email_feedbackReplyQuoteLabel({}, at), original],
    footerReason: 'account',
    meta: m.email_feedbackReplyMeta({}, at),
    preheader: m.email_feedbackReplyPreheader({}, at),
    subject: m.email_feedbackReplySubject({}, at),
    title: m.email_feedbackReplyTitle({}, at),
  }
}
