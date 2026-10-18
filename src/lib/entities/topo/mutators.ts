import * as z from '$lib/forms/zod'
import { defineMutator } from '@rocicorp/zero'
import { createTopoSchema, reorderToposSchema, replaceTopoImageSchema, saveTopoLinesSchema } from './dto'

// Validate and write nothing: ids are serial, storage is the server's, and the editor keeps its
// own unsaved state until the committed rows sync back.
const waitForServer = async () => {}

export const toposMutatorDefs = {
  topos: {
    create: defineMutator(createTopoSchema, waitForServer),
    delete: defineMutator(z.object({ id: z.number() }), waitForServer),
    reorder: defineMutator(reorderToposSchema, waitForServer),
    replaceImage: defineMutator(replaceTopoImageSchema, waitForServer),
    saveLines: defineMutator(saveTopoLinesSchema, waitForServer),
  },
}
