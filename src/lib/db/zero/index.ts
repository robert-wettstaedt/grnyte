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

export async function preload({ session, z }: App.PageData) {
  if (session != null) {
    const ctx: QueryContext = { authUserId: session?.user.id }

    const preloadOpts = { ttl: '5m' as const }

    try {
      await Promise.all([
        z.current.preload(queries.currentUser(ctx), preloadOpts),
        z.current.preload(queries.currentUserRegions(ctx), preloadOpts),
        z.current.preload(queries.currentUserRoles(ctx), preloadOpts),
        z.current.preload(queries.grades(ctx), preloadOpts),
        z.current.preload(queries.regions(ctx), preloadOpts),
        z.current.preload(queries.rolePermissions(ctx), preloadOpts),
        z.current.preload(queries.tags(ctx), preloadOpts),

        z.current.preload(queries.listAllAreas(ctx), preloadOpts),
        z.current.preload(queries.listAllAscents(ctx), preloadOpts),
        z.current.preload(queries.listAllBlocks(ctx), preloadOpts),
        z.current.preload(queries.listAllFiles(ctx), preloadOpts),
        z.current.preload(queries.listAllFirstAscensionists(ctx), preloadOpts),
        z.current.preload(queries.listAllGeolocations(ctx), preloadOpts),
        z.current.preload(queries.listAllRouteExternalResource27crags(ctx), preloadOpts),
        z.current.preload(queries.listAllRouteExternalResource8a(ctx), preloadOpts),
        z.current.preload(queries.listAllRouteExternalResourceTheCrag(ctx), preloadOpts),
        z.current.preload(queries.listAllRouteExternalResources(ctx), preloadOpts),
        z.current.preload(queries.listAllRoutes(ctx), preloadOpts),
        z.current.preload(queries.listAllRoutesToFirstAscensionists(ctx), preloadOpts),
        z.current.preload(queries.listAllRoutesToTags(ctx), preloadOpts),
        z.current.preload(queries.listAllTopoRoutes(ctx), preloadOpts),
        z.current.preload(queries.listAllTopos(ctx), preloadOpts),
        z.current.preload(queries.listAllUsers(ctx), preloadOpts),
      ])

      console.log('All queries preloaded successfully')
    } catch (error) {
      console.error('Error preloading queries:', error)
    }
  }
}

export function initZero(session: Session | undefined | null) {
  const z = new Z<Schema>({
    auth: session?.access_token,
    userID: session?.user.id ?? 'anon',
    server: PUBLIC_ZERO_URL,
    schema,
  })

  return z
}
