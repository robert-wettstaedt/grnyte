import { areasMutatorDefs } from '$lib/entities/area/mutators'
import { ascentsMutatorDefs } from '$lib/entities/ascent/mutators'
import { blocksMutatorDefs } from '$lib/entities/block/mutators'
import { favoritesMutatorDefs } from '$lib/entities/favorite/mutators'
import { routesMutatorDefs } from '$lib/entities/route/mutators'
import { defineMutators } from '@rocicorp/zero'

/** The client half of every mutator: what runs locally before the server answers, never trusted.
 *  `mutators.server.ts` is a separate registry of the authoritative writes. */
export const mutators = defineMutators({
  ...ascentsMutatorDefs,
  ...areasMutatorDefs,
  ...blocksMutatorDefs,
  ...favoritesMutatorDefs,
  ...routesMutatorDefs,
})
