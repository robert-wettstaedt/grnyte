import { areasServerMutatorDefs } from '$lib/entities/area/mutators.server'
import { ascentsServerMutatorDefs } from '$lib/entities/ascent/mutators.server'
import { blocksServerMutatorDefs } from '$lib/entities/block/mutators.server'
import { favoritesServerMutatorDefs } from '$lib/entities/favorite/mutators.server'
import { filesServerMutatorDefs } from '$lib/entities/file/mutators.server'
import { routesServerMutatorDefs } from '$lib/entities/route/mutators.server'
import { toposServerMutatorDefs } from '$lib/entities/topo/mutators.server'
import { defineMutators } from '@rocicorp/zero'

// Not merged over the client registry: an unmatched name must fail, not run its client half here.
export const serverMutators = defineMutators({
  ...toposServerMutatorDefs,
  ...filesServerMutatorDefs,
  ...ascentsServerMutatorDefs,
  ...areasServerMutatorDefs,
  ...blocksServerMutatorDefs,
  ...favoritesServerMutatorDefs,
  ...routesServerMutatorDefs,
})
