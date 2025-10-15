import { PUBLIC_ZERO_URL } from '$env/static/public'
import { schema, type Schema } from '$lib/db/zero/zero-schema'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'
import { queries } from './queries'

export * from './queries'
export * from './types'
export * from './zero-schema'
export {
  type Activity,
  type Area,
  type Ascent,
  type Block,
  type BunnyStream,
  type ClientErrorLog,
  type File,
  type FirstAscensionist,
  type Geolocation,
  type Grade,
  type PushSubscription,
  type Region,
  type RegionInvitation,
  type RegionMember,
  type RolePermission,
  type Route,
  type RouteExternalResource,
  type RouteExternalResource27Crag,
  type RouteExternalResource8A,
  type RouteExternalResourceTheCrag,
  type RoutesToFirstAscensionist,
  type RoutesToTag,
  type Tag,
  type Topo,
  type TopoRoute,
  type User,
  type UserRole,
  type UserSetting,
} from './zero-schema.gen'

export function initZero(session: Session | undefined | null) {
  const z = new Z<Schema>({
    auth: session?.access_token,
    userID: session?.user.id ?? 'anon',
    server: PUBLIC_ZERO_URL,
    schema,
  })

  if (session != null) {
    Promise.all([
      z.current.preload(queries.grades(session)).complete,
      z.current.preload(queries.tags(session)).complete,
      z.current.preload(queries.regions(session)).complete,
      z.current.preload(queries.rolePermissions(session)).complete,

      z.current.preload(queries.currentUserRoles(session)).complete,
      z.current.preload(queries.currentUser(session)).complete,
      z.current.preload(queries.currentUserRegions(session)).complete,

      z.current.preload(queries.listUsers(session, {})).complete,
      z.current.preload(queries.listAreas(session, {})).complete,
      z.current.preload(queries.listBlocks(session, {})).complete,
      z.current.preload(queries.firstAscensionists(session)).complete,
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
