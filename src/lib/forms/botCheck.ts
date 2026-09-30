import * as z from '$lib/forms/zod'

/** The field the proof-of-work widget posts its solve in. */
export const PROOF_OF_WORK_FIELD = 'altcha'

/** Spread into an anonymous form's schema, and render `BotCheck` in the form. */
export const botFields = {
  // A field people never see. Bots fill every input they find, so a value here means a bot.
  hpcheck: z.optional(z.string()),
  [PROOF_OF_WORK_FIELD]: z.optional(z.string()),
}

export interface BotFields {
  hpcheck?: string
  [PROOF_OF_WORK_FIELD]?: string
}
