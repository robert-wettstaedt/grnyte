import { m } from '$lib/paraglide/messages'
import type { EmailContent, EmailLocale } from './shell'

/**
 * The two membership mails: your role in a region changed, and your access to one was removed.
 * Localized per recipient like {@link inviteEmailContent}, unlike the GoTrue templates, because
 * the cron renders these itself and knows each recipient's `contactLocale`.
 *
 * Both name the region in the copy, which no in-app sentence does: an inbox row has a crumb drawn
 * from `region_fk` and an email has none.
 *
 * Unconditional, with no opt-out column and no `List-Unsubscribe` header, like the rest of
 * `$lib/email`: service messages about an account, a handful per membership, nowhere near the
 * 5,000/day that makes one-click unsubscribe a requirement at the big mailbox providers. The six
 * switches in `user_settings` govern push and nothing else, here included.
 */

export interface MembershipEmailInput {
  /** The RECIPIENT's locale, from `contactLocale`. Never the ambient one. */
  locale: EmailLocale
  regionName: string
  /** Absolute app origin, so the CTA points at the environment that sent the mail. */
  url: string
}

export interface RoleChangedEmailInput extends MembershipEmailInput {
  /** Who made the change. Named here, unlike the removal copy. See below. */
  actor: string
  /**
   * The granted role, already resolved to a label by `roleLabelFor`.
   *
   * `undefined` when it does not resolve, which is what a retired role stored on an old row looks
   * like. The copy then drops to the plain sentence rather than naming a role that no longer
   * means anything, exactly as `notificationView` does for the same case.
   */
  role: string | undefined
}

/**
 * Passive, and it names no actor on purpose: every other sentence in the app names one, and this
 * is the one place where that turns a membership change into a personal one. The recipient cannot
 * open the region for context either, so a name would be a name and nothing else.
 */
export function membershipRemovedEmailContent({ locale, regionName, url }: MembershipEmailInput): EmailContent {
  const at = { locale }

  return {
    action: { label: m.email_openApp({}, at), url },
    body: [m.email_membershipRemovedBody1({ region: regionName }, at), m.email_membershipRemovedBody2({}, at)],
    footerReason: 'account',
    meta: m.email_membershipRemovedMeta({}, at),
    preheader: m.email_membershipRemovedPreheader({ region: regionName }, at),
    subject: m.email_membershipRemovedSubject({ region: regionName }, at),
    title: m.email_membershipRemovedTitle({}, at),
  }
}

export function roleChangedEmailContent({ actor, locale, regionName, role, url }: RoleChangedEmailInput): EmailContent {
  const at = { locale }

  return {
    action: { label: m.email_openApp({}, at), url },
    body: [
      role == null
        ? m.email_roleChangedBody1Plain({ actor, region: regionName }, at)
        : m.email_roleChangedBody1({ actor, region: regionName, role }, at),
      m.email_roleChangedBody2({}, at),
    ],
    footerReason: 'account',
    meta: m.email_roleChangedMeta({}, at),
    preheader: m.email_roleChangedPreheader({ region: regionName }, at),
    subject: m.email_roleChangedSubject({ region: regionName }, at),
    title: m.email_roleChangedTitle({}, at),
  }
}
