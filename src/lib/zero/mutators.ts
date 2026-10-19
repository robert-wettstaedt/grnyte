import { areasMutatorDefs } from '$lib/entities/area/mutators'
import { ascentsMutatorDefs } from '$lib/entities/ascent/mutators'
import { blocksMutatorDefs } from '$lib/entities/block/mutators'
import { favoritesMutatorDefs } from '$lib/entities/favorite/mutators'
import { feedbackMutatorDefs } from '$lib/entities/feedback/mutators'
import { filesMutatorDefs } from '$lib/entities/file/mutators'
import { notificationsMutatorDefs } from '$lib/entities/notification/mutators'
import { reactionsMutatorDefs } from '$lib/entities/reaction/mutators'
import { routesMutatorDefs } from '$lib/entities/route/mutators'
import { toposMutatorDefs } from '$lib/entities/topo/mutators'
import { usersMutatorDefs } from '$lib/entities/user/mutators'
import { defineMutators } from '@rocicorp/zero'

/** The client half of every mutator: what runs locally before the server answers, never trusted.
 *  `mutators.server.ts` is a separate registry of the authoritative writes. */
export const mutators = defineMutators({
  ...feedbackMutatorDefs,
  ...usersMutatorDefs,
  ...notificationsMutatorDefs,
  ...reactionsMutatorDefs,
  ...toposMutatorDefs,
  ...filesMutatorDefs,
  ...ascentsMutatorDefs,
  ...areasMutatorDefs,
  ...blocksMutatorDefs,
  ...favoritesMutatorDefs,
  ...routesMutatorDefs,
})
