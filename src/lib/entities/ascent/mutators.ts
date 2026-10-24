import { removableIdArgs } from '$lib/entities/moderation/dto'
import { defineMutator } from '@rocicorp/zero'
import { ascentActionSchema } from './dto'

// Validate and write nothing: ids are serial, and a delete takes media the server must remove.
const waitForServer = async () => {}

export const ascentsMutatorDefs = {
  ascents: {
    create: defineMutator(ascentActionSchema, waitForServer),
    delete: defineMutator(removableIdArgs, waitForServer),
    update: defineMutator(ascentActionSchema, waitForServer),
  },
}
