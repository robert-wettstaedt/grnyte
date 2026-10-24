import { removableIdArgs } from '$lib/entities/moderation/dto'
import { defineMutator } from '@rocicorp/zero'
import { blockActionSchema, blockPinSchema, reorderBlocksSchema, restoreBlockSchema } from './dto'

// Each validates and writes nothing: forms, creates and deletes wait for the server (ids are serial),
// and a reorder or a pin is answered by the server's rows rather than drawn first.
const waitForServer = async () => {}

export const blocksMutatorDefs = {
  blocks: {
    create: defineMutator(blockActionSchema, waitForServer),
    delete: defineMutator(removableIdArgs, waitForServer),
    estimateLocation: defineMutator(blockPinSchema, waitForServer),
    reorder: defineMutator(reorderBlocksSchema, waitForServer),
    restore: defineMutator(restoreBlockSchema, waitForServer),
    setLocation: defineMutator(blockPinSchema, waitForServer),
    update: defineMutator(blockActionSchema, waitForServer),
  },
}
