import { command, form, getRequestEvent } from '$app/server'
import { holdCodeSession } from '$lib/auth/contested.server'
import { botFields } from '$lib/forms/botCheck'
import { formError, mailedCodeSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { invalid } from '@sveltejs/kit'
import * as body from './forgot-password.server'

const forgotPasswordSchema = z.object({
  ...botFields,
  email: z.email({ error: formError('form_required') }),
})

export const forgotPassword = form(forgotPasswordSchema, (submitted) => body.forgotPassword(submitted, invalid))

export const confirmResetCode = command(mailedCodeSchema, async (input) => {
  const { locals } = getRequestEvent()
  const { next } = await holdCodeSession(locals.supabase, await body.confirmResetCode(input), 'choosePassword')
  return { next }
})
