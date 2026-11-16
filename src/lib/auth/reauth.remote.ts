import { command, getRequestEvent, query } from '$app/server'
import { IDENTITY_TARGETS, REAUTH_ACTIONS, type ReauthAction } from '$lib/auth'
import { pinnedTx } from '$lib/db/pinned.server'
import { userSettings } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { contactLocale } from '$lib/i18n/message'
import { getLocale } from '$lib/paraglide/runtime'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { hasGrant, issueReauthCode, reauthCaller, verifyReauthCode, type ReauthCaller } from './reauth.server'

const subject = z.object({
  action: z.enum(REAUTH_ACTIONS),
  target: z.string().check(z.minLength(1), z.maxLength(80)),
})

/** The account's own actions target the caller, whatever the page sent (it sends `self`). */
function boundTo(caller: ReauthCaller, action: ReauthAction, target: string): string {
  if (action.startsWith('identity.') && !(IDENTITY_TARGETS as readonly string[]).includes(target)) error(400)
  return action === 'account.delete' || action === 'password.change' ? caller.authUserId : target
}

export const requestReauthCode = command(subject, async ({ action, target: sent }) => {
  const caller = await reauthCaller()
  const target = boundTo(caller, action, sent)
  const email = getRequestEvent().locals.claims?.email
  if (email == null) error(401, formError('auth_notSignedIn'))

  const [settings] = await pinnedTx((tx) =>
    tx
      .select({ contactLocale: userSettings.contactLocale })
      .from(userSettings)
      .where(eq(userSettings.authUserFk, caller.authUserId))
      .limit(1),
  )
  const locale = settings?.contactLocale == null ? getLocale() : contactLocale(settings.contactLocale)

  const issued = await issueReauthCode(caller, action, target, { email, locale })
  if (issued === 'limited') return refuseCommand(formError('auth_tooManyTries'))
  if (issued === 'unsent') return refuseCommand(formError('auth_mailUnavailable'))
  return issued
})

const REFUSAL = {
  expired: 'auth_codeExpired',
  void: 'auth_codeLocked',
  wrong: 'auth_codeWrong',
} as const

/** Checks the code; a right one confirms this action and target for 5 minutes and runs nothing. */
export const confirmReauthCode = command(
  z.object({ ...subject.shape, code: z.string().check(z.maxLength(12)) }),
  async ({ action, code, target }) => {
    const caller = await reauthCaller()
    const answer = await verifyReauthCode(caller, action, boundTo(caller, action, target), code)
    if (answer !== 'granted') refuseCommand(formError(REFUSAL[answer]), 'code')
    return { confirmed: true }
  },
)

/** Whether this session already confirmed this action and target. Spends nothing. */
export const reauthGrantStatus = query(subject, async ({ action, target }) => {
  const caller = await reauthCaller()
  return hasGrant(caller, action, boundTo(caller, action, target))
})
