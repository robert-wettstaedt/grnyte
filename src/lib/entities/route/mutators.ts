import { removableIdArgs } from '$lib/entities/moderation/dto'
import { defineMutator } from '@rocicorp/zero'
import { restoreRouteSchema, routeActionSchema } from './dto'

// Each validates and writes nothing: a form, a create and a delete wait for the server, and ids are
// serial, so a local row would show something the server then replaces.
const waitForServer = async () => {}

export const routesMutatorDefs = {
  routes: {
    create: defineMutator(routeActionSchema, waitForServer),
    delete: defineMutator(removableIdArgs, waitForServer),
    restore: defineMutator(restoreRouteSchema, waitForServer),
    update: defineMutator(routeActionSchema, waitForServer),
  },
}
