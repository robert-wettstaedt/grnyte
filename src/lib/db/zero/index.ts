import { PUBLIC_ZERO_URL } from '$env/static/public'
import { schema, type Schema } from '$lib/db/zero/zero-schema'
import type { Session } from '@supabase/supabase-js'
import { Z } from 'zero-svelte'
import { queries, type QueryContext } from './queries'

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

export async function initZero(session: Session | undefined | null) {
  const z = new Z<Schema>({
    auth: session?.access_token,
    userID: session?.user.id ?? 'anon',
    server: PUBLIC_ZERO_URL,
    schema,
  })

  const ctx: QueryContext = { authUserId: session?.user.id }

  if (session != null) {
    await Promise.all([
      z.current.preload(queries.grades(ctx)).complete,
      z.current.preload(queries.tags(ctx)).complete,
      z.current.preload(queries.regions(ctx)).complete,
      z.current.preload(queries.rolePermissions(ctx)).complete,

      z.current.preload(queries.currentUserRoles(ctx)).complete,
      z.current.preload(queries.currentUser(ctx)).complete,
      z.current.preload(queries.currentUserRegions(ctx)).complete,

      z.current.preload(queries.listAllAreas(ctx)).complete,
      z.current.preload(queries.listAllBlocks(ctx)).complete,
      z.current.preload(queries.listAllRoutes(ctx)).complete,
      z.current.preload(queries.listAllAscents(ctx)).complete,
      z.current.preload(queries.listAllTopos(ctx)).complete,
      z.current.preload(queries.listAllFiles(ctx)).complete,
      z.current.preload(queries.listAllGeolocations(ctx)).complete,
      z.current.preload(queries.listAllUsers(ctx)).complete,
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
