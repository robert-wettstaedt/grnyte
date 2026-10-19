import { PUBLIC_ORIGIN } from '$env/static/public'
import { asPrivileged, defineServerMutator } from '$lib/zero/serverMutator.server'
import { feedbackSchema } from './dto'
import { submitFeedbackRow } from './submit.server'

export const feedbackServerMutatorDefs = {
  feedback: {
    // The configured origin: this request's own is the internal `ZERO_MUTATE_URL`.
    submit: defineServerMutator(feedbackSchema, async ({ args, ctx, tx }) => {
      await asPrivileged(tx, (db) => submitFeedbackRow(args, { ...ctx, db }, PUBLIC_ORIGIN))
    }),
  },
}
