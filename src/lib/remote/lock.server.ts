import type * as schema from '$lib/db/schema'
import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/** Every advisory lock namespace, so a test holds the same one the handler takes. */
export const LOCK = {
  regionMembers: 'region_members',
  regionOwner: 'region_owner',
  topoFile: 'topo_file',
} as const

export type LockNamespace = (typeof LOCK)[keyof typeof LOCK]

/**
 * Serialises count-then-write sections on one key until the transaction ends (so never on the pool).
 * Advisory because RLS applies the UPDATE policy to `for update`, which a reader cannot take.
 */
export function lockKey(db: PostgresJsDatabase<typeof schema>, namespace: LockNamespace, key: number | string) {
  const id = typeof key === 'number' ? sql`${key}` : sql`hashtext(${key})`
  return db.execute(sql`select pg_advisory_xact_lock(hashtext(${namespace}), ${id})`)
}
