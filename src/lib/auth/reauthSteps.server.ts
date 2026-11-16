import { getRequestEvent } from '$app/server'
import type { ReauthAction } from '$lib/auth'
import { pinnedTx } from '$lib/db/pinned.server'
import { userSettings } from '$lib/db/schema'
import { formError } from '$lib/forms/schemas'
import { contactLocale } from '$lib/i18n/message'
import { getLocale } from '$lib/paraglide/runtime'
import { refuseCommand } from '$lib/remote/authed.server'
import { error } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import { boundTarget, hasGrant, issueReauthCode, reauthCaller, verifyReauthCode } from './reauth.server'

interface Subject {
  action: ReauthAction
  target: string
}

export async function requestReauthCode({ action, target: sent }: Subject) {
  const caller = await reauthCaller()
  const target = boundTarget(caller, action, sent)
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
}

const REFUSAL = {
  expired: 'auth_codeExpired',
  void: 'auth_codeLocked',
  wrong: 'auth_codeWrong',
} as const

/** Checks the code; a right one confirms this action and target for 5 minutes and runs nothing. */
export async function confirmReauthCode({ action, code, target }: Subject & { code: string }) {
  const caller = await reauthCaller()
  const answer = await verifyReauthCode(caller, action, boundTarget(caller, action, target), code)
  if (answer !== 'granted') refuseCommand(formError(REFUSAL[answer]), 'code')
  return { confirmed: true }
}

/** Whether this session already confirmed this action and target. Spends nothing. */
export async function reauthGrantStatus({ action, target }: Subject) {
  const caller = await reauthCaller()
  return hasGrant(caller, action, boundTarget(caller, action, target))
}
