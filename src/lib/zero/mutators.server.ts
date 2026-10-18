import { areasServerMutatorDefs } from '$lib/entities/area/mutators.server'
import { blocksServerMutatorDefs } from '$lib/entities/block/mutators.server'
import { favoritesServerMutatorDefs } from '$lib/entities/favorite/mutators.server'
import { routesServerMutatorDefs } from '$lib/entities/route/mutators.server'
import { defineMutators } from '@rocicorp/zero'

// Not merged over the client registry: an unmatched name must fail, not run its client half here.
export const serverMutators = defineMutators({
  ...areasServerMutatorDefs,
  ...blocksServerMutatorDefs,
  ...favoritesServerMutatorDefs,
  ...routesServerMutatorDefs,
})
