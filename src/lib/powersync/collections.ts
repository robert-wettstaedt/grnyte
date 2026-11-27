import type { PowerSyncDatabase } from '@powersync/web'
import { BasicIndex, createCollection, IR, type LoadSubsetOptions, type SyncConfigRes } from '@tanstack/db'
import { powerSyncCollectionOptions } from '@tanstack/powersync-db-collection'
import { getPowerSync, registerCollections } from './db.svelte'
import { appSchema } from './schema'

type Tables = typeof appSchema.props

// Indexed as queries filter: joins and lookups by `nid` or a foreign key otherwise scan the whole collection.
const make = <K extends keyof Tables>(database: PowerSyncDatabase, table: K) => {
  const options = powerSyncCollectionOptions({
    autoIndex: 'eager',
    database,
    defaultIndexType: BasicIndex,
    // A query's own rows only: a whole table taken in on a screen's first read cost a cold start 0.4 to 0.6 s.
    syncMode: 'on-demand',
    table: appSchema.props[table],
  })
  return createCollection({
    ...options,
    // Started on first use: an eager start held a cold start's first map query back by ~1 s on iOS.
    startSync: false,
    sync: { ...options.sync, sync: (params) => withEveryRowFilter(options.sync.sync(params)) },
  })
}

/** Always true, as SQL: `?` bound to 1, alone or merged with `or()`. A number, since the SQLite binding of a JS boolean is not ours to rely on. */
const EVERY_ROW = new IR.Value(1) as unknown as IR.BasicExpression<boolean>

type Collections = { [K in keyof Tables]: ReturnType<typeof make<K>> }

// shortcut: powersync-db-collection 0.2.13 merges readers' filters with or(), where a missing one compiles to NULL, so
// two unfiltered reads of one table load nothing; drop this once upstream sends TRUE for a reader with no filter.
function withEveryRowFilter<T>(result: T): T {
  if (result == null || typeof result !== 'object' || !('loadSubset' in result)) return result
  const { loadSubset, unloadSubset } = result as unknown as Required<Pick<SyncConfigRes, 'loadSubset' | 'unloadSubset'>>
  // The sync knows a subset by the object it was given, so letting go hands back that same object.
  const sent = new WeakMap<LoadSubsetOptions, LoadSubsetOptions>()
  return {
    ...result,
    loadSubset: (subset: LoadSubsetOptions) => {
      const filtered = subset.where == null ? { ...subset, where: EVERY_ROW } : subset
      sent.set(subset, filtered)
      return loadSubset(filtered)
    },
    unloadSubset: (subset: LoadSubsetOptions) => unloadSubset(sent.get(subset) ?? subset),
  }
}

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
  }
  return built.collections
}
