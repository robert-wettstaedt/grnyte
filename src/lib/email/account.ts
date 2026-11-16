import type { ReauthAction } from '$lib/auth'
import type { SignInMethods } from '$lib/auth/methods.server'
import { m } from '$lib/paraglide/messages'
import type { EmailContent, EmailLocale } from './shell'

/** grnyte's own account mails. Each ends with a "not me" line naming the account's sign-in methods. */

interface AccountEmailInput {
  /** The RECIPIENT's locale. */
  locale: EmailLocale
  methods: SignInMethods
}

const ACTIONS: Record<ReauthAction, (at: { locale: EmailLocale }) => string> = {
  'account.delete': (at) => m.email_reauthActionAccountDelete({}, at),
  'identity.link': (at) => m.email_reauthActionIdentityLink({}, at),
  'identity.unlink': (at) => m.email_reauthActionIdentityUnlink({}, at),
  'password.change': (at) => m.email_reauthActionPasswordChange({}, at),
  'region.delete': (at) => m.email_reauthActionRegionDelete({}, at),
  'region.transfer': (at) => m.email_reauthActionRegionTransfer({}, at),
}

/** "your password or Google"; forgot password when the account has no method left to name. */
function methodList({ locale, methods }: AccountEmailInput): string {
  const at = { locale }
  const names = [
    ...(methods.hasPassword ? [m.email_methodPassword({}, at)] : []),
    ...(methods.providers.includes('apple') ? [m.email_methodApple({}, at)] : []),
    ...(methods.providers.includes('google') ? [m.email_methodGoogle({}, at)] : []),
  ]
  if (names.length === 0) return m.email_methodForgotPassword({}, at)
  return new Intl.ListFormat(locale, { type: 'disjunction' }).format(names)
}

const notMe = (input: AccountEmailInput) => m.email_notMe({ methods: methodList(input) }, { locale: input.locale })

/** `appleRevoked`: Apple confirmed the deletion and its token was revoked (design decision 7). */
export function accountDeleted(input: AccountEmailInput & { appleRevoked?: boolean }): EmailContent {
  const at = { locale: input.locale }
  const subject = m.email_accountDeletedSubject({}, at)
  const methods = methodList(input)
  return {
    body: [
      m.email_accountDeletedBody1({ methods }, at),
      ...(input.appleRevoked === true ? [m.email_accountDeletedAppleRevoked({}, at)] : []),
      m.email_accountDeletedBody2({}, at),
    ],
    footerReason: 'account',
    footnote: m.email_accountDeletedNotMe({ methods }, at),
    meta: m.email_accountDeletedMeta({}, at),
    preheader: m.email_accountDeletedPreheader({}, at),
    subject,
    title: subject,
  }
}

export function alreadyHasAccount(input: AccountEmailInput & { forgotPasswordUrl: string }): EmailContent {
  const at = { locale: input.locale }
  const subject = m.email_alreadyHasAccountSubject({}, at)
  return {
    action: { label: m.email_alreadyHasAccountAction({}, at), url: input.forgotPasswordUrl },
    body: [m.email_alreadyHasAccountBody1({ methods: methodList(input) }, at), m.email_alreadyHasAccountBody2({}, at)],
    footerReason: 'account',
    footnote: notMe(input),
    meta: m.email_alreadyHasAccountMeta({}, at),
    preheader: m.email_alreadyHasAccountPreheader({}, at),
    subject,
    title: subject,
  }
}

export function ownershipHandedOver(input: AccountEmailInput & { owner: string; region: string }): EmailContent {
  const at = { locale: input.locale }
  const names = { owner: input.owner, region: input.region }
  const subject = m.email_ownershipHandedOverSubject(names, at)
  return {
    body: [m.email_ownershipHandedOverBody(names, at)],
    footerReason: 'account',
    footnote: notMe(input),
    meta: m.email_ownershipHandedOverMeta({}, at),
    preheader: m.email_ownershipHandedOverPreheader(names, at),
    subject,
    title: subject,
  }
}

export function passwordChanged(input: AccountEmailInput): EmailContent {
  const at = { locale: input.locale }
  const subject = m.email_passwordChangedSubject({}, at)
  return {
    body: [m.email_passwordChangedBody({}, at)],
    footerReason: 'account',
    footnote: notMe(input),
    meta: m.email_passwordChangedMeta({}, at),
    preheader: m.email_passwordChangedPreheader({}, at),
    subject,
    title: subject,
  }
}

export function reauthCode(input: AccountEmailInput & { action: ReauthAction; code: string }): EmailContent {
  const at = { locale: input.locale }
  return {
    body: [m.email_reauthCodeBody({ action: ACTIONS[input.action](at) }, at)],
    code: input.code,
    footerReason: 'account',
    footnote: notMe(input),
    meta: m.email_reauthCodeMeta({}, at),
    preheader: m.email_reauthCodePreheader({}, at),
    subject: m.email_reauthCodeSubject({ code: input.code }, at),
    title: m.email_reauthCodeTitle({}, at),
  }
}
