import { resolve } from '$app/paths'
import type * as z from '$lib/forms/zod'
import { mutators } from '$lib/zero/mutators'
import { write } from '$lib/zero/write'
import type { feedbackSchema } from './dto'

export const submitFeedback = (values: z.input<typeof feedbackSchema>) =>
  write(mutators.feedback.submit({ ...values, userAgent: navigator.userAgent.slice(0, 512) }), {
    redirectTo: resolve('/(app)/settings'),
  })
