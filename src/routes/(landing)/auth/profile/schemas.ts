import { formError, usernameSchema } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'

// Beside `profile.remote.ts`, which may export only remote functions.
export const profileSchema = z.object({
  gradingScale: z.enum(['FB', 'V'], { error: formError('form_required') }),
  next: z.optional(z.string()),
  username: usernameSchema,
})
