/**
 * The one way to write a key of a region's `settings`.
 *
 * `settings` is a single jsonb blob holding two independently edited keys (`mapLayers`, `tags`),
 * so every write is a read-modify-write and every one of them can lose another's. This module owns
 * the three things that makes safe: the row lock the read takes, the proof that the key being
 * written was read whole, and the merge that leaves sibling keys alone.
 *
 * Separate from `settings.ts` because that one is isomorphic: the client mapper and the auth hook
 * both import it, so drizzle cannot go there without landing in the browser bundle.
 *
 * Why a lock rather than only a compare-and-swap. The two writers want opposite answers to a
 * conflict. A tag edit is surgical (add this word, retire that one) and two admins doing it at once
 * should both succeed, so their writes serialise. Replacing the whole `mapLayers` array does not
 * commute, so a second admin submitting a form that rendered before the first one's save must be
 * refused, which is what `mapLayersFingerprint` is for and why that check stays in the handler.
 * The lock makes the first case correct; the fingerprint makes the second case correct.
 */
import * as schema from '$lib/db/schema'
import { regions } from '$lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { readRegionSettings, type RegionSettings, type StoredSettings } from './settings'

type Db = PostgresJsDatabase<typeof schema>

/**
 * A transaction, and deliberately not `Db`.
 *
 * The neighbouring server modules take the base connection so tests can pass the superuser pool,
 * which is safe where nothing locks. It is not safe here: on the pool `for update` runs in
 * autocommit, so the lock is taken and released inside that one statement and every promise
 * {@link LockedSettings} makes is then false. Narrowing the parameter is what stops the most
 * natural mistake in the file a future author will copy from.
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Brands the two proof types below. Not exported, so neither can be built outside this module. */
declare const proof: unique symbol

/**
 * A region's settings, read under `for update`.
 *
 * Only {@link lockRegionSettings} produces one, which is the point: holding it means the row is
 * locked for the rest of the transaction, so what it says is still true at the moment of writing.
 */
export interface LockedSettings {
  readonly [proof]: 'locked'
  /** The raw column, for the compare-and-swap. The parsed form cannot serve: reading drops what it
   *  does not recognise, and the predicate has to compare what is actually stored. */
  readonly raw: unknown
  readonly regionFk: number
  readonly stored: StoredSettings
}

/**
 * Permission to write one key back, which {@link writableKey} grants only for a key that read
 * whole.
 *
 * A key that lost an element on the way in cannot be written back: what was read is short of what
 * is stored, so saving it deletes the difference. That is the rule this type exists to make
 * unskippable, because it used to live in two places and be answered from two different sources.
 */
export interface WritableKey<K extends keyof RegionSettings> {
  readonly key: K
  readonly locked: LockedSettings
  readonly [proof]: 'writable'
}

/** Which completeness flag answers for which key. The flags are one boolean per key rather than a
 *  record keyed by it, so the mapping has to be stated somewhere; here, once. */
const completeness: { [K in keyof RegionSettings]: (stored: StoredSettings) => boolean } = {
  mapLayers: (stored) => stored.layersComplete,
  tags: (stored) => stored.tagsComplete,
}

/**
 * The value `writable` is about, as it was read under the lock.
 *
 * Spelled once here rather than reached for through `writable.locked.stored.settings[...]` at each
 * call site, which is the traversal every caller wants and none should have to know the shape of.
 */
export function currentValue<K extends keyof RegionSettings>(writable: WritableKey<K>): RegionSettings[K] {
  return writable.locked.stored.settings[writable.key]
}

/**
 * Read a region's settings and lock the row for the rest of the transaction.
 *
 * `undefined` means the write cannot proceed, and deliberately does not say which of two reasons:
 * the region is gone, or this caller may not update it. Postgres applies the UPDATE policy's
 * `using` clause to `for update` as well as the SELECT one, so a member who is not an admin is
 * filtered here rather than at the write. That is load bearing: it is what stops a caller demoted
 * between the auth hook's read and this transaction from getting as far as the destructive
 * statements in `tags.server.ts`. Gate on the caller's memberships first if the difference between
 * "gone" and "not allowed" is worth reporting, which it is on every screen that has one.
 *
 * `db.select` and not `db.query.regions.findFirst`, because `for update` is only on the core
 * select builder. That is also why callers here cannot use `requireRow`, which AGENTS.md otherwise
 * requires: its loader cannot express the lock, and restoring it would quietly drop the guard.
 *
 * The lock is held until the handler's transaction commits, so it covers everything the caller does
 * next, `renameTag`'s mass update of `routes_to_tags` included. On a region with thousands of tagged
 * routes that is a real span, and it blocks the other writers of this row (the map layers form and
 * the region rename) for the duration. Acceptable because these are rare administrative edits, but
 * it presents as an unexplained wait rather than an error, so do not add slow work under the lock.
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

/**
 * Permission to write `key`, or `undefined` when this build could not read it whole.
 *
 * Call it before doing any of the work the write completes. `renameTag` and `removeTag` move and
 * destroy `routes_to_tags` rows, and while the transaction would roll those back, a refusal that
 * arrives before the destructive statement is one that never has to.
 */
export function writableKey<K extends keyof RegionSettings>(
  locked: LockedSettings,
  key: K,
): undefined | WritableKey<K> {
  return completeness[key](locked.stored) ? ({ key, locked } as WritableKey<K>) : undefined
}

/**
 * Write one key back, merged over whatever else the blob holds.
 *
 * Merged rather than assigned because each settings screen owns a single key: a key added to
 * `RegionSettings` later must not be wiped by an older screen that never knew about it.
 *
 * `'zero'` means the UPDATE matched nothing. Under the lock that is a narrow set of causes (the row
 * went away, or the write policy refused it while the read policy allowed the lock), because
 * another writer cannot have got in. The compare-and-swap predicate is kept anyway: it costs one
 * comparison and it is what still holds if a future caller writes without locking first.
 */
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
      // `${key}::text` and not a bare parameter. `jsonb -> unknown` resolves to `-> integer` as
      // readily as `-> text`, and the integer operator subscripts an array instead of looking a key
      // up, so an unannotated parameter leaves the predicate's meaning to Postgres. It resolves the
      // right way today; the cast is what stops that being luck. The old code did not need this
      // because the key was a SQL literal.
      sql`${regions.id} = ${locked.regionFk} and coalesce(${regions.settings} -> ${key}::text, 'null'::jsonb) is not distinct from ${expected}::jsonb`,
    )
    .returning({ id: regions.id })

  return written.length === 0 ? 'zero' : 'ok'
}
