import { m } from '$lib/paraglide/messages'
import type { EmailContent, EmailLocale } from './shell'

export interface InviteEmailInput {
  /** Username of whoever sent the invitation. Named in the subject, so a forwarded mail
   *  still says who it came from. */
  inviter: string
  /** The RECIPIENT's locale, from `resolveContactLocale`. Never the ambient one. */
  locale: EmailLocale
  regionName: string
  /** Absolute accept URL, token included. */
  url: string
}

/**
 * The region invitation mail.
 *
 * The first localized template: unlike the GoTrue ones in `templates.ts`, we render this
 * ourselves per recipient, so the copy can be a message key rather than an English literal.
 * Pure on purpose, so the vitest suite can assert the URL, the region and the locale as data
 * instead of scraping an inbox.
 */
export function inviteEmailContent({ inviter, locale, regionName, url }: InviteEmailInput): EmailContent {
  const at = { locale }

  return {
    action: { label: m.email_inviteAction({ region: regionName }, at), url },
    body: [m.email_inviteBody1({ inviter, region: regionName }, at), m.email_inviteBody2({}, at)],
    footerReason: 'invite',
    footnote: m.email_inviteFootnote({}, at),
    meta: m.email_inviteMeta({}, at),
    preheader: m.email_invitePreheader({ region: regionName }, at),
    subject: m.email_inviteSubject({ inviter, region: regionName }, at),
    title: m.email_inviteTitle({ region: regionName }, at),
  }
}
