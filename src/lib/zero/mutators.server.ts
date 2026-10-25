import { areasServerMutatorDefs } from '$lib/entities/area/mutators.server'
import { ascentsServerMutatorDefs } from '$lib/entities/ascent/mutators.server'
import { blocksServerMutatorDefs } from '$lib/entities/block/mutators.server'
import { favoritesServerMutatorDefs } from '$lib/entities/favorite/mutators.server'
import { feedbackServerMutatorDefs } from '$lib/entities/feedback/mutators.server'
import { filesServerMutatorDefs } from '$lib/entities/file/mutators.server'
import { moderationServerMutatorDefs } from '$lib/entities/moderation/mutators.server'
import { notificationsServerMutatorDefs } from '$lib/entities/notification/mutators.server'
import { reactionsServerMutatorDefs } from '$lib/entities/reaction/mutators.server'
import { regionsServerMutatorDefs } from '$lib/entities/region/mutators.server'
import { reportsServerMutatorDefs } from '$lib/entities/report/mutators.server'
import { routesServerMutatorDefs } from '$lib/entities/route/mutators.server'
import { toposServerMutatorDefs } from '$lib/entities/topo/mutators.server'
import { usersServerMutatorDefs } from '$lib/entities/user/mutators.server'
import { defineMutators } from '@rocicorp/zero'

// Not merged over the client registry: an unmatched name must fail, not run its client half here.
export const serverMutators = defineMutators({
  ...regionsServerMutatorDefs,
  ...feedbackServerMutatorDefs,
  ...usersServerMutatorDefs,
  ...notificationsServerMutatorDefs,
  ...reactionsServerMutatorDefs,
  ...toposServerMutatorDefs,
  ...filesServerMutatorDefs,
  ...ascentsServerMutatorDefs,
  ...areasServerMutatorDefs,
  ...blocksServerMutatorDefs,
  ...favoritesServerMutatorDefs,
  ...routesServerMutatorDefs,
  ...moderationServerMutatorDefs,
  ...reportsServerMutatorDefs,
})
