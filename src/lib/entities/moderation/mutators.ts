import { defineMutator } from '@rocicorp/zero'
import { undoRemovalSchema } from './dto'

const waitForServer = async () => {}

export const moderationMutatorDefs = {
  moderation: {
    undoRemoval: defineMutator(undoRemovalSchema, waitForServer),
  },
}
