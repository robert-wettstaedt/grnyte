import { supabaseAuthServer } from '$lib/auth/authServer.server'
import { clearCodeTries, takeCodeTry, type CodeKind } from '$lib/auth/codeAttempts.server'
import { gotrueRefusal } from '$lib/auth/mail.server'
import { formError } from '$lib/forms/schemas'
import { refuseCommand } from '$lib/remote/authed.server'
import type { EmailOtpType } from '@supabase/supabase-js'
import type { RequestEvent } from '@sveltejs/kit'

/**
 * Verifies a mailed GoTrue code on grnyte's path: each try is counted per address before GoTrue
 * sees it (`kinds`, design decision 5), and a correct code clears those counts.
 */
export async function verifyCode(
  event: Pick<RequestEvent, 'getClientAddress'>,
  { code, email, kinds, type }: { code: string; email: string; kinds: CodeKind[]; type: EmailOtpType },
) {
  if (!(await takeCodeTry(email, kinds))) refuseCommand(formError('auth_codeLocked'), 'code')
  const { data, error } = await supabaseAuthServer(event).verifyOtp({ email, token: code, type })
  if (error != null) {
    // GoTrue answers a wrong and an expired code alike.
    refuseCommand(
      error.code === 'otp_expired' ? formError('auth_codeWrong') : await gotrueRefusal(error, 'verify'),
      'code',
    )
  }
  for (const kind of kinds) await clearCodeTries(email, kind)
  return data
}
