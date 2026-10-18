import { defineMutator } from '@rocicorp/zero'
import { routeActionSchema } from './dto'

export const routesMutatorDefs = {
  routes: {
    // Validates and writes nothing: a form waits for the server, and a half-applied edit would show.
    update: defineMutator(routeActionSchema, async () => {}),
  },
}
