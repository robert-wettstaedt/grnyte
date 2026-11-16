import { command, form, getRequestEvent } from '$app/server'
import { holdCodeSession } from '$lib/auth/contested.server'
import { botFields } from '$lib/forms/botCheck'
import { formError, mailedCodeSchema, passwordSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import { refuseVia } from '$lib/remote/authed.server'
import * as body from './signup.server'

// `confirmPassword` is optional for one release: a tab loaded before the single field still sends it.
const signUpSchema = z.object({
  ...botFields,
  confirmPassword: z.optional(z.string()),
  email: z.email({ error: formError('form_required') }),
  password: passwordSchema,
})

const resendSchema = z.object({
  ...botFields,
  email: z.email({ error: formError('form_required') }),
  resendToken: z.optional(z.string()),
})

export const signUp = form(signUpSchema, (submitted, issue) => body.signUp(submitted, refuseVia(issue)))

export const confirmSignupCode = command(mailedCodeSchema, async (input) => {
  const { next } = await holdCodeSession(
    getRequestEvent().locals.supabase,
    await body.confirmSignupCode(input),
    'profile',
  )
  return { next }
})

export const resendSignupCode = form(resendSchema, (submitted, issue) =>
  body.resendSignupCode(submitted, refuseVia(issue)),
)
