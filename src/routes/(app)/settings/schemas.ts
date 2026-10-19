import { formError, passwordSchema, passwordsMatch } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

// Beside `account.remote.ts`, which may export only remote functions: the store forms need these too.

export const updateEmailSchema = z.object({ email: z.email({ error: formError('form_required') }) })

export const updatePasswordSchema = z
  .object({
    confirmPassword: z.string({ error: formError('form_required') }),
    currentPassword: z.string({ error: formError('form_required') }),
    password: passwordSchema,
  })
  .check(passwordsMatch)
