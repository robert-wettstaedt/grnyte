import { removableIdArgs } from '$lib/entities/moderation/dto'
import * as z from '$lib/forms/zod'
import { defineMutator } from '@rocicorp/zero'
import { addParkingSchema, areaActionSchema, restoreAreaSchema, restoreParkingSchema } from './dto'

// Each validates and writes nothing: forms, creates and deletes wait for the server (ids are serial).
const waitForServer = async () => {}

export const areasMutatorDefs = {
  areas: {
    addParking: defineMutator(addParkingSchema, waitForServer),
    create: defineMutator(areaActionSchema, waitForServer),
    delete: defineMutator(removableIdArgs, waitForServer),
    deleteParking: defineMutator(z.object({ id: z.number() }), waitForServer),
    restore: defineMutator(restoreAreaSchema, waitForServer),
    restoreParking: defineMutator(restoreParkingSchema, waitForServer),
    update: defineMutator(areaActionSchema, waitForServer),
  },
}
