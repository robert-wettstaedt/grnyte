import { PUBLIC_ZERO_URL } from '$env/static/public'
import { schema, type Schema } from '$lib/db/zero/zero-schema'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'

export * from './types'
export * from './zero-schema'

export function initZero(session: Session | undefined | null) {
  const z = new Z<Schema>({
    auth: session?.access_token,
    userID: session?.user.id ?? 'anon',
    server: PUBLIC_ZERO_URL,
    schema,
    // mutators: createMutators({ sub: session.user.id }),
  })

  if (session != null) {
    Promise.all([
      z.query.areas.preload().complete,
      z.query.blocks.preload().complete,
      z.query.firstAscensionists.preload().complete,
      z.query.geolocations.preload().complete,
      z.query.grades.preload().complete,
      z.query.regions.preload().complete,
      z.query.rolePermissions.preload().complete,
      z.query.routes.preload().complete,
      z.query.routesToFirstAscensionists.preload().complete,
      z.query.routesToTags.preload().complete,
      z.query.tags.preload().complete,
      z.query.topoRoutes.preload().complete,
      z.query.topos.preload().complete,
      z.query.userRoles.preload().complete,
      z.query.users.preload().complete,
      z.query.userSettings.preload().complete,
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
