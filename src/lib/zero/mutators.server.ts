import { favoritesServerMutatorDefs } from '$lib/entities/favorite/mutators.server'
import { routesServerMutatorDefs } from '$lib/entities/route/mutators.server'
import { defineMutators } from '@rocicorp/zero'

// Not merged over the client registry: an unmatched name must fail, not run its client half here.
export const serverMutators = defineMutators({
  ...favoritesServerMutatorDefs,
  ...routesServerMutatorDefs,
})
