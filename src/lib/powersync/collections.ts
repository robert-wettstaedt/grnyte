import type { PowerSyncDatabase } from '@powersync/web'
import { createCollection } from '@tanstack/db'
import { powerSyncCollectionOptions } from '@tanstack/powersync-db-collection'
import { getPowerSync } from './db.svelte'
import { appSchema } from './schema'

type Tables = typeof appSchema.props

const make = <K extends keyof Tables>(database: PowerSyncDatabase, table: K) =>
  createCollection(powerSyncCollectionOptions({ database, table: appSchema.props[table] }))

type Collections = { [K in keyof Tables]: ReturnType<typeof make<K>> }

let built: undefined | { collections: Collections; database: PowerSyncDatabase }

/** One collection per synced table, on the signed-in account's database; rebuilt when the account changes. */
export function collections(): Collections {
  const database = getPowerSync()
  if (built?.database !== database) {
    const tables = Object.keys(appSchema.props) as (keyof Tables)[]
    built = {
      collections: Object.fromEntries(tables.map((table) => [table, make(database, table)])) as Collections,
      database,
    }
  }
  return built.collections
}
