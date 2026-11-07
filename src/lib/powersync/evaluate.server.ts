/**
 * `deployment/powersync/sync-config.yaml`, evaluated by PowerSync's own sync-rules engine the way the service does:
 * parameter rows build the lookup index, a token picks the buckets, every data row is routed into buckets. Tests
 * feed it real rows and ask what a user would hold, without a running service.
 */
import {
  DEFAULT_HYDRATION_STATE,
  nodeSqlite,
  RequestJwtPayload,
  RequestParameters,
  SqlSyncRules,
  type RequestedStream,
  type SqliteJsonRow,
  type SqliteRow,
} from '@powersync/service-sync-rules'
import { readFileSync } from 'node:fs'
import * as sqlite from 'node:sqlite'

const config = SqlSyncRules.fromYaml(readFileSync('deployment/powersync/sync-config.yaml', 'utf8'), {
  defaultSchema: 'public',
}).config
const synced = config.hydrate({ hydrationState: DEFAULT_HYDRATION_STATE, sqlite: nodeSqlite(sqlite) })

/** Every table a stream reads. */
export const syncedTables: string[] = [...new Set(config.getSourceTables().map((table) => table.tablePattern))].sort()

export interface Held {
  data: SqliteJsonRow
  table: string
}

/** The rows replicated so far, and what each account would hold of them. */
export class SyncedWorld {
  #lookups = new Map<string, SqliteJsonRow[]>()
  #routed: (Held & { bucket: string })[] = []

  /** Runs one table's rows through the engine. Parameter tables must be added whole, or a lookup goes missing. */
  add(table: string, rows: readonly Record<string, unknown>[]): void {
    const ref = { connectionTag: 'default', name: table, schema: 'public' }
    for (const raw of rows) {
      const record = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, toSqlite(value)]))
      if (synced.tableSyncsParameters(ref)) {
        for (const result of synced.evaluateParameterRow(ref, record)) {
          const key = result.lookup.serializedRepresentation
          this.#lookups.set(key, [...(this.#lookups.get(key) ?? []), ...result.bucketParameters])
        }
      }
      if (synced.tableSyncsData(ref)) {
        for (const row of synced.evaluateRow({ record, sourceTable: ref })) {
          this.#routed.push({ bucket: row.bucket, data: row.data, table: row.table })
        }
      }
    }
  }

  /** Every row an account signed in as `authId` would hold, optionally asking for streams with parameters. */
  async holdings(authId: string, streams: Record<string, RequestedStream[]> = {}): Promise<Held[]> {
    const { errors, querier } = synced.getBucketParameterQuerier({
      globalParameters: new RequestParameters(new RequestJwtPayload({ aud: 'authenticated', sub: authId }), {}),
      hasDefaultStreams: true,
      streams,
    })
    if (errors.length > 0) throw new Error(JSON.stringify(errors))
    const dynamic = await querier.queryDynamicBucketDescriptions({
      getParameterSets: async (requested) =>
        requested.map((lookup) => ({ lookup, rows: this.#lookups.get(lookup.serializedRepresentation) ?? [] })),
    })
    const buckets = new Set([...querier.staticBuckets, ...dynamic].map((bucket) => bucket.bucket))
    return this.#routed.filter((row) => buckets.has(row.bucket))
  }

  /** Every row that reached any bucket. */
  routed(): Held[] {
    return this.#routed
  }
}

/** A Postgres value as logical replication hands it to PowerSync. */
function toSqlite(value: unknown): SqliteRow[string] {
  if (value == null) return null
  if (typeof value === 'boolean') return value ? 1n : 0n
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return value as string
}
