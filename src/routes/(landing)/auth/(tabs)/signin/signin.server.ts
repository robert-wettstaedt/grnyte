import { getRequestEvent } from '$app/server'
import { supabaseAuthServer } from '$lib/auth/server/authServer.server'
import { endSession, issueResendToken } from '$lib/auth/server/contested.server'
import { gotrueRefusal, sendCode } from '$lib/auth/server/mail.server'
import { normalizePassword } from '$lib/forms/schemas'

/**
 * The app's sign-in of an unconfirmed account. A confirmed one signs in here after all; nobody
 * holds that session, so it ends at once and the app signs in at GoTrue directly.
 */
export async function signInUnconfirmed(
  input: { email: string; password: string },
  refuse: (message: string) => never,
) {
  const signedIn = await signInWithPassword(input, refuse)
  if (signedIn.kind === 'unconfirmed') return { confirm: signedIn.confirm, resendToken: signedIn.resendToken }
  const { data, error } = signedIn.answer
  if (error != null) return refuse(await gotrueRefusal(error, 'token'))
  await endSession(data.session)
  return { alreadyConfirmed: true as const }
}

/**
 * A password sign-in at GoTrue, NFC first and once more as entered. An unconfirmed account gets a
 * new code without flagging (GoTrue checked the password first, so this is the owner).
 */
export async function signInWithPassword(
  { email, password }: { email: string; password: string },
  refuse: (message: string) => never,
) {
  const authServer = supabaseAuthServer(getRequestEvent())

  // Never trimmed: a password set before the whitespace rule keeps working.
  const normalized = normalizePassword(password)
  let answer = await authServer.signInWithPassword({ email, password: normalized })
  // A password stored before NFC normalising may be decomposed; the later checks read this answer.
  if (answer.error?.code === 'invalid_credentials' && normalized !== password) {
    answer = await authServer.signInWithPassword({ email, password })
  }

  if (answer.error?.code === 'email_not_confirmed') {
    await sendCode(authServer, email, { refuse })
    return { confirm: email, kind: 'unconfirmed' as const, resendToken: issueResendToken(email) }
  }
  return { answer, kind: 'answered' as const }
}
