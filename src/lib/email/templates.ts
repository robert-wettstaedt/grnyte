import { BRAND } from './brand.cli'
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
 * Voice: warm, terse, second person, contractions. No em-dashes, no exclamation marks, no
 * "click here", no apologies. `grnyte` always lowercase.
 */

const SITE = '{{ .SiteURL }}'

// The code lifetime GoTrue is configured with (MAILER_OTP_EXP=600). This copy is a promise.
const EXPIRY = '10 MINUTES'
const expiry = '10 minutes'
// `{{ .Token }}` is safe in a subject: it is digits, so html/template escaping cannot alter it.
const CODE = '{{ .Token }}'
const codeExpires = `The code works once and expires in ${expiry}. Never share it with anyone.`

/** The six authentication templates. Codes, never links, except the dashboard-only invite. */
const auth = {
  confirmation: {
    body: [
      'Somebody signed up for grnyte with this address. Enter this code in grnyte to confirm it and finish setting up your account.',
      'Once you’re in, you can join a region or start one of your own and invite people.',
    ],
    code: CODE,
    footerReason: 'signup',
    // Not "no account is created": the unconfirmed auth.users row exists before this is sent.
    footnote: `${codeExpires} If you didn’t sign up, ignore this email. The address stays unconfirmed and the account unusable.`,
    meta: `SIGN UP · CODE EXPIRES IN ${EXPIRY}`,
    preheader: 'Enter this code in grnyte to confirm your address.',
    subject: `${CODE} is your grnyte sign-up code`,
    title: 'Confirm your email',
  },

  email_change: {
    // GoTrue sends this to BOTH the old and the new address with different codes, and nothing
    // changes until both are entered. Recipient-neutral: paragraph one names {{ .NewEmail }}.
    body: [
      'You asked to move your grnyte account to {{ .NewEmail }}. Enter this code in grnyte to confirm this address.',
      'We sent a code to the old address and to the new one. Enter both to complete the change.',
    ],
    code: CODE,
    footerReason: 'account',
    footnote: `${codeExpires} If you didn’t ask to change your email, ignore this email. Nothing changes until both codes are entered.`,
    meta: `EMAIL CHANGE · CODE EXPIRES IN ${EXPIRY}`,
    preheader: 'Enter the codes from both addresses to finish the change.',
    subject: `${CODE} is your grnyte email change code`,
    title: 'Confirm the change',
  },

  invite: {
    // Only the Supabase dashboard sends this, and grnyte never uses it: no token link, the reset code sets the password.
    action: { label: 'Set your password', url: `${SITE}/auth/forgot-password` },
    body: [
      'Somebody invited you to a private region on grnyte. Only the people in it can see its areas, topos and ascents.',
      'To claim the seat, set a password: enter this address and grnyte mails you a code.',
    ],
    footerReason: 'invite',
    footnote: 'If you weren’t expecting this, ignore this email.',
    meta: 'INVITE',
    preheader: 'Set a password to claim your seat.',
    subject: 'Somebody invited you to grnyte',
    title: 'Somebody saved you a seat',
  },

  // grnyte never asks GoTrue for this; if anything does, the mail carries neither link nor code.
  magic_link: {
    body: ['Somebody asked for a sign-in link to grnyte for this address. grnyte doesn’t sign in by email link.'],
    footerReason: 'account',
    footnote:
      'To sign in, open grnyte and use your usual sign-in method. If you didn’t ask for this, ignore this email.',
    meta: 'SIGN IN',
    preheader: 'grnyte doesn’t sign in by email link.',
    subject: 'About your grnyte sign-in',
    title: 'No sign-in link',
  },

  reauthentication: {
    // The OTP is passed as the `nonce` option to supabase.auth.updateUser() rather than verified.
    body: ['Enter this code in grnyte to confirm the change you started.'],
    code: CODE,
    footerReason: 'account',
    footnote:
      'The code works once. If you didn’t start a change in grnyte, ignore this email and never share the code with anyone.',
    meta: 'VERIFICATION CODE · ONE TIME USE',
    preheader: 'Enter this code in grnyte to confirm it’s you.',
    subject: `${CODE} is your grnyte verification code`,
    title: 'Confirm it’s you',
  },

  recovery: {
    body: [
      'Somebody asked to reset the password for the grnyte account on this address. Enter this code in grnyte to pick a new one.',
      'Your current password keeps working until you set the new one.',
    ],
    code: CODE,
    footerReason: 'account',
    footnote: `${codeExpires} If you didn’t ask for this, ignore this email. Your password stays as it is.`,
    meta: `PASSWORD RESET · CODE EXPIRES IN ${EXPIRY}`,
    preheader: 'Enter this code in grnyte to set a new password.',
    subject: `${CODE} is your grnyte password reset code`,
    title: 'Set a new password',
  },
} as const satisfies Record<string, EmailContent>

/**
 * The seven security notifications. Off unless enabled per project
 * (`mailer_notifications_<key>_enabled`). None of them carry a token, so the CTA is a plain
 * link to settings and the footnote is the recovery path rather than an expiry note.
 */
const SETTINGS = { label: 'Open your settings', url: `${SITE}/settings` }
// Method-neutral: an account may have no password to reset.
const notMe = `If this wasn’t you, write to ${BRAND.contactEmail} right away so we can secure your account.`

const notifications = {
  email_changed_notification: {
    action: SETTINGS,
    body: [
      'The address on your grnyte account changed from {{ .OldEmail }} to {{ .Email }}.',
      'Codes and notifications now go to the new address.',
    ],
    footerReason: 'account',
    // GoTrue sends this to the OLD address only, so the reader is whoever has now lost the
    // account. Do not tell them to act "from the new address": in the takeover case that is
    // the mailbox the attacker controls, and it is not one they can reach either way.
    footnote: `If this wasn’t you, somebody else controls the account now. Write to ${BRAND.contactEmail} at once: codes no longer reach you.`,
    meta: 'SECURITY · EMAIL CHANGED',
    preheader: 'The address on your grnyte account changed.',
    subject: 'Your email address changed',
    title: 'Your email address changed',
  },

  identity_linked_notification: {
    action: SETTINGS,
    body: ['You can now sign in to your grnyte account with {{ .Provider }}.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · SIGN-IN METHOD LINKED',
    preheader: 'Your grnyte account has a new way to sign in.',
    subject: 'A new sign-in method on your account',
    title: 'A new sign-in method',
  },

  identity_unlinked_notification: {
    action: SETTINGS,
    body: ['You can no longer sign in to your grnyte account with {{ .Provider }}.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · SIGN-IN METHOD REMOVED',
    preheader: 'Your grnyte account has one less way to sign in.',
    subject: 'One less sign-in method on your account',
    title: 'One less sign-in method',
  },

  mfa_factor_enrolled_notification: {
    action: SETTINGS,
    body: [
      'Your grnyte account has a new verification method ({{ .FactorType }}). You’ll need it the next time you sign in.',
    ],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · VERIFICATION METHOD ADDED',
    preheader: 'You’ll need {{ .FactorType }} the next time you sign in.',
    subject: 'A new verification method on your account',
    title: 'A new verification method',
  },

  mfa_factor_unenrolled_notification: {
    action: SETTINGS,
    body: ['You no longer need {{ .FactorType }} to sign in to grnyte.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · VERIFICATION METHOD REMOVED',
    preheader: 'You won’t need {{ .FactorType }} when you sign in.',
    subject: 'One less verification method on your account',
    title: 'One less verification method',
  },

  password_changed_notification: {
    action: SETTINGS,
    body: ['The password for your grnyte account changed.', 'If that was you, there’s nothing to do.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · PASSWORD CHANGED',
    preheader: 'The password on your grnyte account changed.',
    subject: 'Your password changed',
    title: 'Your password changed',
  },

  phone_changed_notification: {
    action: SETTINGS,
    body: ['The phone number on your grnyte account changed from {{ .OldPhone }} to {{ .Phone }}.'],
    footerReason: 'account',
    footnote: notMe,
    meta: 'SECURITY · PHONE CHANGED',
    preheader: 'The phone number on your grnyte account changed.',
    subject: 'Your phone number changed',
    title: 'Your phone number changed',
  },
} as const satisfies Record<string, EmailContent>

/** Keyed by GoTrue's template key, which is also the Management API field name. */
export const GOTRUE_TEMPLATES = { ...auth, ...notifications }
