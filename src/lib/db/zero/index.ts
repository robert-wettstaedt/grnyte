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

export function initZero(session: Session | undefined | null): Z<Schema, undefined> {
  const z = new Z<Schema>({
    auth: session?.access_token,
    context: session == null ? undefined : { authUserId: session.user.id },
    schema,
    server: PUBLIC_ZERO_URL,
    userID: session?.user.id ?? 'anon',
  })

  if (session != null) {
    Promise.all([
      z.preload(queries.grades()).complete,
      z.preload(queries.tags()).complete,
      z.preload(queries.regions()).complete,
      z.preload(queries.rolePermissions()).complete,
      z.preload(queries.currentUserRoles()).complete,
      z.preload(queries.currentUser()).complete,
      z.preload(queries.currentUserRegions()).complete,
      z.preload(queries.listUsers({})).complete,
      z.preload(queries.listAreas({})).complete,
      z.preload(queries.listBlocks({})).complete,
      z.preload(queries.listRoutes({})).complete,
      z.preload(queries.firstAscensionists()).complete,
      z.preload(queries.favorites({})).complete,
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
