import type { Pathname } from '$app/types'
import type { EmailContent } from './shell'

/**
 * Copy for the 13 email templates Supabase Auth (GoTrue) can send. `npm run generate`
 * renders these through the shared shell into `emails/gotrue/`, which is what gets pasted
 * into the dashboard (Authentication > Emails) or PATCHed via the Management API.
 *
 * Deliberately plain English literals rather than i18n keys: GoTrue stores ONE template per
 * type with no notion of a recipient locale, so German copy here would be dead weight. The
 * shell chrome does go through Paraglide, so the day we move these behind a Send Email Hook
 * (which renders in our own code, per recipient) the templates localise by swapping these
 * strings for `m.*` calls and nothing else changes.
 *
 * Voice: warm, terse, second person. No em-dashes, no exclamation marks, no "click here",
 * no apologies. `grnyte` always lowercase.
 */

const SITE = '{{ .SiteURL }}'

/**
 * Always link through our own `/auth/confirm` handler with `token_hash`, never
 * `{{ .ConfirmationURL }}`: that one hits Supabase's `/auth/v1/verify` and hands the session
 * back in the URL *fragment*, which never reaches the server, so SSR cannot see it.
 *
 * `next` must be a path, never `{{ .RedirectTo }}` (an absolute URL), because the handler
 * assigns it straight to `redirectTo.pathname`. Typed as a {@link Pathname} for that reason: these
 * links sit in mail that has already been delivered, so a route renamed here has to fail the build
 * rather than 404 somebody a week later.
 */
const confirmUrl = (type: string, next: Pathname) =>
  `${SITE}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`

/** Where an unauthenticated recipient lands to pick a password. Exempt from the signed-in bounce. */
const SET_PASSWORD: Pathname = '/auth/reset-password'

// The link and OTP lifetime GoTrue is configured with (MAILER_OTP_EXP, 86400s by default).
// It appears in the meta line, the preheader and the footnote of five templates, so it lives
// here. Check the project's actual value before shipping and change it in one place if it differs.
const EXPIRY = '24 HOURS'
const expiresIn = 'The link works once and expires in 24 hours.'

/** The six authentication templates. All send a link except `reauthentication`, which has no token. */
const auth = {
  confirmation: {
    action: { label: 'Confirm my email', url: confirmUrl('signup', '/') },
    body: [
      'Somebody signed up for grnyte with this address. Open the link to confirm it and finish setting up your account.',
      'Once you are in you can join a region, or start one of your own and invite people.',
    ],
    footerReason: 'signup',
    // Not "no account is created": GoTrue inserts the unconfirmed auth.users row before it
    // sends this. Ignoring the mail leaves that row unconfirmed, it does not prevent it.
    footnote: `${expiresIn} If you did not sign up, ignore this email. The address is never confirmed and the account stays unusable.`,
    meta: `SIGN UP · LINK EXPIRES IN ${EXPIRY}`,
    preheader: 'One link to confirm this address and your grnyte account is live.',
    subject: 'Confirm your email address',
    title: 'Confirm your email',
  },

  email_change: {
    action: { label: 'Confirm the change', url: confirmUrl('email_change', '/settings') },
    // GoTrue sends this to BOTH the old and the new address with different token hashes, and
    // nothing changes until both are opened. The copy says so because the first click returns
    // HTTP 200 with no session, which otherwise looks like it worked.
    //
    // The same body goes to both recipients, so the subject, title and button must be
    // recipient-neutral: "confirm this address" would be wrong for the reader at the old one.
    // Paragraph one names {{ .NewEmail }}, which is what tells them apart.
    body: [
      'You asked to move your grnyte account to {{ .NewEmail }}. Open the link to confirm this address.',
      'We sent a link to the old address and to the new one. Open both to complete the change.',
    ],
    footerReason: 'account',
    footnote: `${expiresIn} If you did not ask to change your email, ignore this email. Nothing changes until both links are opened.`,
    meta: `EMAIL CHANGE · LINK EXPIRES IN ${EXPIRY}`,
    preheader: 'Open the link at both addresses to finish the change.',
    subject: 'Confirm your email change',
    title: 'Confirm the change',
  },

  invite: {
    action: { label: 'Claim your seat', url: confirmUrl('invite', SET_PASSWORD) },
    body: [
      'You were invited to a private region on grnyte. Areas, topos and session logs, visible only to the people in it.',
      'Claim the seat and pick a password. Takes about a minute.',
    ],
    footerReason: 'invite',
    // Not "no account exists until you open the link": `internal/api/invite.go` creates the
    // user row and the email identity inside the same transaction that sends this.
    footnote: `${expiresIn} If you were not expecting this, ignore this email. The invite expires and the seat is never claimed.`,
    meta: `INVITE · LINK EXPIRES IN ${EXPIRY}`,
    preheader: 'Open the link to claim your seat. It works once and expires in 24 hours.',
    subject: 'You are invited to grnyte',
    title: 'Someone saved you a seat',
  },

  magic_link: {
    action: { label: 'Sign in to grnyte', url: confirmUrl('magiclink', '/') },
    body: ['Open the link to sign in to grnyte on this device. No password needed.'],
    footerReason: 'account',
    footnote: `${expiresIn} If you did not ask to sign in, ignore this email and nothing happens.`,
    meta: `SIGN IN · LINK EXPIRES IN ${EXPIRY}`,
    preheader: 'One link and you are back in. It works once and expires in 24 hours.',
    subject: 'Your sign-in link',
    title: 'Your sign-in link',
  },

  reauthentication: {
    // The only template with no link: it has neither TokenHash nor ConfirmationURL, and the
    // OTP is passed as the `nonce` option to supabase.auth.updateUser() rather than verified
    // as a link. `{{ .Token }}` is safe in the subject because it is digits, so html/template
    // escaping cannot alter it.
    body: ['Enter this code in grnyte to confirm the change you started.'],
    code: '{{ .Token }}',
    footerReason: 'account',
    footnote:
      'The code works once. If you did not start a change in grnyte, ignore this email and do not share the code with anyone.',
    meta: 'VERIFICATION CODE · ONE TIME USE',
    preheader: 'Enter this code in grnyte to confirm it is you.',
    subject: '{{ .Token }} is your grnyte verification code',
    title: 'Confirm it is you',
  },

  recovery: {
    action: { label: 'Set a new password', url: confirmUrl('recovery', SET_PASSWORD) },
    body: [
      'Somebody asked to reset the password for the grnyte account on this address. Open the link to pick a new one.',
      'Your current password keeps working until you set the new one.',
    ],
    footerReason: 'account',
    footnote: `${expiresIn} If you did not ask for this, ignore this email. Your password stays as it is.`,
    meta: `PASSWORD RESET · LINK EXPIRES IN ${EXPIRY}`,
    preheader: 'Open the link to set a new password. It works once and expires in 24 hours.',
    subject: 'Reset your password',
    title: 'Set a new password',
  },
} as const satisfies Record<string, EmailContent>

/**
 * The seven security notifications. Off unless enabled per project
 * (`mailer_notifications_<key>_enabled`). None of them carry a token, so the CTA is a plain
 * link to settings and the footnote is the recovery path rather than an expiry note.
 */
const SETTINGS = { label: 'Open your settings', url: `${SITE}/settings` }
const notMe = 'If this was not you, reset your password right away and check what is signed in to your account.'

const notifications = {
  email_changed_notification: {
    action: SETTINGS,
    body: [
      'The address on your grnyte account changed from {{ .OldEmail }} to {{ .Email }}.',
      'Sign-in links and notifications now go to the new address.',
    ],
    footerReason: 'account',
    // GoTrue sends this to the OLD address only, so the reader is whoever just lost the
    // account. Do not tell them to act "from the new address": in the takeover case that is
    // the mailbox the attacker controls, and it is not one they can reach either way.
    footnote:
      'If this was not you, somebody else controls the account now. Get in touch at once, sign-in links no longer reach you.',
    meta: 'SECURITY · EMAIL CHANGED',
    preheader: 'The address on your grnyte account was just changed.',
    subject: 'Your email address was changed',
    title: 'Your email address was changed',
  },

  identity_linked_notification: {
    action: SETTINGS,
    body: ['{{ .Provider }} can now be used to sign in to your grnyte account.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · SIGN-IN METHOD LINKED',
    preheader: 'A new way to sign in was added to your grnyte account.',
    subject: 'A new sign-in method was linked to your account',
    title: 'A sign-in method was linked',
  },

  identity_unlinked_notification: {
    action: SETTINGS,
    body: ['{{ .Provider }} can no longer be used to sign in to your grnyte account.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · SIGN-IN METHOD REMOVED',
    preheader: 'A way to sign in was removed from your grnyte account.',
    subject: 'A sign-in method was removed from your account',
    title: 'A sign-in method was removed',
  },

  mfa_factor_enrolled_notification: {
    action: SETTINGS,
    body: [
      'A new verification method ({{ .FactorType }}) was added to your grnyte account. You will be asked for it when you sign in.',
    ],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · VERIFICATION METHOD ADDED',
    preheader: 'You will be asked for {{ .FactorType }} the next time you sign in.',
    subject: 'A new verification method was added to your account',
    title: 'A verification method was added',
  },

  mfa_factor_unenrolled_notification: {
    action: SETTINGS,
    body: ['The verification method ({{ .FactorType }}) was removed from your grnyte account.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · VERIFICATION METHOD REMOVED',
    preheader: '{{ .FactorType }} will no longer be asked for when you sign in.',
    subject: 'A verification method was removed from your account',
    title: 'A verification method was removed',
  },

  password_changed_notification: {
    action: SETTINGS,
    body: ['The password for your grnyte account was just changed.', 'If that was you, there is nothing to do.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · PASSWORD CHANGED',
    preheader: 'The password on your grnyte account was just changed.',
    subject: 'Your password was changed',
    title: 'Your password was changed',
  },

  phone_changed_notification: {
    action: SETTINGS,
    body: ['The phone number on your grnyte account changed from {{ .OldPhone }} to {{ .Phone }}.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · PHONE CHANGED',
    preheader: 'The phone number on your grnyte account was just changed.',
    subject: 'Your phone number was changed',
    title: 'Your phone number was changed',
  },
} as const satisfies Record<string, EmailContent>

/** Keyed by GoTrue's template key, which is also the Management API field name. */
export const GOTRUE_TEMPLATES = { ...auth, ...notifications }

export type GotrueTemplateKey = keyof typeof GOTRUE_TEMPLATES
