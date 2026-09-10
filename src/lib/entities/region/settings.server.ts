/**
 * The one way to write a key of a region's `settings`. It is a single jsonb blob with two
 * independently edited keys, so every write locks the row, proves the key read whole, and merges.
 *
 * Separate from `settings.ts` because that one is isomorphic and cannot import drizzle.
 * The lock makes concurrent tag edits serialise; `mapLayersFingerprint` in the handler refuses a
 * stale whole-array replacement, which a lock alone cannot catch.
 */
import * as schema from '$lib/db/schema'
import { regions } from '$lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { readRegionSettings, type RegionSettings, type StoredSettings } from './settings'

type Db = PostgresJsDatabase<typeof schema>

/** A transaction, not `Db`: on the pool `for update` runs in autocommit and the lock is released
 *  immediately, making every promise {@link LockedSettings} carries false. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Brands the two proof types below. Not exported, so neither can be built outside this module. */
declare const proof: unique symbol

/** Settings read under `for update`. Holding one means the row stays locked for the transaction. */
export interface LockedSettings {
  readonly [proof]: 'locked'
  /** The raw column, for the compare-and-swap: reading drops what it does not recognise. */
  readonly raw: unknown
  readonly regionFk: number
  readonly stored: StoredSettings
}

/** Permission to write one key back. A key that lost elements on read cannot be written: saving it
 *  would delete the difference. */
export interface WritableKey<K extends keyof RegionSettings> {
  readonly key: K
  readonly locked: LockedSettings
  readonly [proof]: 'writable'
}

/** Which completeness flag answers for which key. */
const completeness: { [K in keyof RegionSettings]: (stored: StoredSettings) => boolean } = {
  mapLayers: (stored) => stored.layersComplete,
  tags: (stored) => stored.tagsComplete,
}

/** The value `writable` is about, as read under the lock. */
export function currentValue<K extends keyof RegionSettings>(writable: WritableKey<K>): RegionSettings[K] {
  return writable.locked.stored.settings[writable.key]
}

/**
 * Read a region's settings and lock the row for the rest of the transaction.
 *
 * `undefined` means gone OR not allowed: Postgres applies the UPDATE policy to `for update`, so a
 * demoted admin is stopped here, before the destructive statements in `tags.server.ts`. Gate on
 * memberships first where the difference is worth reporting. `db.select`, because `findFirst`
 * cannot express `for update` (which is also why callers here cannot use `requireRow`).
 * The lock is held to commit, so do not add slow work under it.
 */
export async function lockRegionSettings(db: Tx, regionFk: number): Promise<LockedSettings | undefined> {
  const [row] = await db
    .select({ id: regions.id, settings: regions.settings })
    .from(regions)
    .where(eq(regions.id, regionFk))
    .for('update')

  if (row == null) {
    return undefined
  }

  return {
    raw: row.settings,
    regionFk: row.id,
    stored: readRegionSettings(row.settings),
  } as LockedSettings
}

/** Permission to write `key`, or `undefined` when this build could not read it whole. Call it
 *  before the work the write completes, so a refusal beats the destructive statements. */
export function writableKey<K extends keyof RegionSettings>(
  locked: LockedSettings,
  key: K,
): undefined | WritableKey<K> {
  return completeness[key](locked.stored) ? ({ key, locked } as WritableKey<K>) : undefined
}

/** Write one key back, merged so a key an older screen never knew about survives.
 *  `'zero'` means the UPDATE matched nothing: the row went away, or the write policy refused it. */
export async function writeRegionSettings<K extends keyof RegionSettings>(
  db: Tx,
  writable: WritableKey<K>,
  value: RegionSettings[K],
): Promise<'ok' | 'zero'> {
  const { key, locked } = writable
  const expected = JSON.stringify((locked.raw as null | Record<string, unknown>)?.[key] ?? null)

  const written = await db
    .update(regions)
    .set({ settings: sql`coalesce(${regions.settings}, '{}'::jsonb) || ${JSON.stringify({ [key]: value })}::jsonb` })
    .where(
      // `${key}::text` and not a bare parameter: `jsonb -> unknown` can resolve to `-> integer`,
      // which subscripts an array instead of looking a key up.
      sql`${regions.id} = ${locked.regionFk} and coalesce(${regions.settings} -> ${key}::text, 'null'::jsonb) is not distinct from ${expected}::jsonb`,
    )
    .returning({ id: regions.id })

  return written.length === 0 ? 'zero' : 'ok'
}
