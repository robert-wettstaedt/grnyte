import { defineMutator } from '@rocicorp/zero'
import { removalTargetSchema } from './dto'

const waitForServer = async () => {}

export const moderationMutatorDefs = {
  moderation: {
    undoRemoval: defineMutator(removalTargetSchema, waitForServer),
  },
}
