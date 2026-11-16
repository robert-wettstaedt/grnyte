import { formError, passwordSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

// Beside `account.remote.ts`, which may export only remote functions: the store forms need these too.

export const updateEmailSchema = z.object({ email: z.email({ error: formError('form_required') }) })

export const emailChangeCodeSchema = z.object({
  code: z.string({ error: formError('form_required') }),
  email: z.email({ error: formError('form_required') }),
})

// `currentPassword` and `confirmPassword` stay optional for one release: a tab from before
// re-authentication still sends them, and the handler answers it with "reload this page".
export const updatePasswordSchema = z.object({
  confirmPassword: z.optional(z.string()),
  currentPassword: z.optional(z.string()),
  password: passwordSchema,
})

// `password` only from an old tab, answered with "reload this page".
export const deleteAccountSchema = z.object({ password: z.optional(z.string()) })
