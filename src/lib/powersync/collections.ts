import type { PowerSyncDatabase } from '@powersync/web'
import { BasicIndex, createCollection } from '@tanstack/db'
import { powerSyncCollectionOptions } from '@tanstack/powersync-db-collection'
import { getPowerSync, powerSyncSettings, registerCollections } from './db.svelte'
import { syncMark } from './marks'
import { appSchema } from './schema'

type Tables = typeof appSchema.props

// Indexed as queries filter: joins and lookups by `nid` or a foreign key otherwise scan the whole collection.
const make = <K extends keyof Tables>(database: PowerSyncDatabase, table: K) =>
  createCollection({
    ...powerSyncCollectionOptions({
      autoIndex: 'eager',
      database,
      defaultIndexType: BasicIndex,
      table: appSchema.props[table],
    }),
    // A measurement switch for task 8.6: only subscribed collections take rows in.
    ...(powerSyncSettings().lazyCollections ? { startSync: false } : {}),
  })

type Collections = { [K in keyof Tables]: ReturnType<typeof make<K>> }

let built: undefined | { collections: Collections; database: PowerSyncDatabase }

/** One collection per synced table, on the signed-in account's database; rebuilt when the account changes. */
export function collections(): Collections {
  const database = getPowerSync()
  if (built?.database !== database) {
    const tables = Object.keys(appSchema.props) as (keyof Tables)[]
    const made = Object.fromEntries(tables.map((table) => [table, make(database, table)])) as Collections
    built = { collections: made, database }
    const all = Object.values(made)
    registerCollections(database, () => all.map((collection) => collection.utils.getMeta().trackedTableName))
    void Promise.all(all.map((collection) => new Promise<void>((resolve) => collection.onFirstReady(resolve)))).then(
      () => syncMark('collections ready'),
    )
  }
  return built.collections
}
