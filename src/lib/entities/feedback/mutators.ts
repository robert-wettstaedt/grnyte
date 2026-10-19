import { defineMutator } from '@rocicorp/zero'
import { feedbackSchema } from './dto'

export const feedbackMutatorDefs = {
  feedback: {
    submit: defineMutator(feedbackSchema, async () => {}),
  },
}
