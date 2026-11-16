import { command, form, getRequestEvent } from '$app/server'
import { contestedNext } from '$lib/auth/contested.server'
import { botFields } from '$lib/forms/botCheck'
import { formError, mailedCodeSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseCommand } from '$lib/remote/authed.server'
import { invalid } from '@sveltejs/kit'
import * as body from './forgot-password.server'

const forgotPasswordSchema = z.object({
  ...botFields,
  email: z.email({ error: formError('form_required') }),
})

export const forgotPassword = form(forgotPasswordSchema, (submitted) => body.forgotPassword(submitted, invalid))

export const confirmResetCode = command(mailedCodeSchema, async (input) => {
  const event = getRequestEvent()
  const { session, user } = await body.confirmResetCode(input)
  if (session == null || user == null) return refuseCommand(formError('auth_unexpectedError'), 'code')
  await event.locals.supabase.auth.setSession(session)
  return { next: (await contestedNext(event.locals.supabase, user)) ?? ('choosePassword' as const) }
})
