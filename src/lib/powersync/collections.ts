import { createCollection } from '@tanstack/db'
import { powerSyncCollectionOptions } from '@tanstack/powersync-db-collection'
import { getPowerSync } from './db.svelte'
import { appSchema } from './schema'

const make = <K extends keyof typeof appSchema.props>(table: K) =>
  createCollection(powerSyncCollectionOptions({ database: getPowerSync(), table: appSchema.props[table] }))

let built: ReturnType<typeof build> | undefined
const build = () => ({
  areas: make('areas'),
  ascents: make('ascents'),
  blocks: make('blocks'),
  favorites: make('favorites'),
  files: make('files'),
  geolocations: make('geolocations'),
  routes: make('routes'),
  routesToTags: make('routes_to_tags'),
  topoRoutes: make('topo_routes'),
  topos: make('topos'),
  users: make('users'),
})

export function collections() {
  return (built ??= build())
}
