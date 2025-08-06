import { PUBLIC_ZERO_URL } from '$env/static/public'
import { schema, type Schema } from '$lib/db/zero/zero-schema'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'
import type { User } from '../schema'

export * from './types'
export * from './zero-schema'

export function initZero(session: Session | undefined | null, user: User | undefined | null) {
  const z = new Z<Schema>({
    auth: session?.access_token,
    userID: session?.user.id ?? 'anon',
    server: PUBLIC_ZERO_URL,
    schema,
    // mutators: createMutators({ sub: session.user.id }),
  })

  if (user != null) {
    Promise.all([
      z.current.query.areas.preload().complete,
      z.current.query.blocks.preload().complete,
      z.current.query.firstAscensionists.preload().complete,
      z.current.query.geolocations.preload().complete,
      z.current.query.grades.preload().complete,
      z.current.query.regions.preload().complete,
      z.current.query.rolePermissions.preload().complete,
      z.current.query.routes.related('ascents', (q) => q.where('createdBy', user.id)).preload().complete,
      z.current.query.routesToFirstAscensionists.preload().complete,
      z.current.query.routesToTags.preload().complete,
      z.current.query.tags.preload().complete,
      z.current.query.topoRoutes.preload().complete,
      z.current.query.topos.preload().complete,
      z.current.query.userRoles.preload().complete,
      z.current.query.users.preload().complete,
      z.current.query.userSettings.preload().complete,
    ])
      .then(() => {
        console.log('All queries preloaded successfully')
      })
      .catch((error) => {
        console.error('Error preloading queries:', error)
      })
  }

  return z
}
