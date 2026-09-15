/**
 * The database half of editing a region's route-tag vocabulary. The remote functions keep the
 * permission checks and the refusals; this keeps the SQL.
 *
 * Every function takes a {@link WritableKey}, carrying the vocabulary as read under the row lock.
 * A bare `string[]` off the request's memberships was the bug: the auth hook parses those on
 * another connection, so two admins editing at once each wrote a stale copy back.
 */
import * as schema from '$lib/db/schema'
import { routesToTags } from '$lib/db/schema'
import { and, count, eq, inArray, ne } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { currentValue, writeRegionSettings, type WritableKey } from './settings.server'

// Base connection type, so tests can pass the superuser pool. Only the read takes it: a writer
// takes `Tx`, because a pool handle would mean the row lock was already released.
type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** For the writers that ADD a name: a jsonb array has no unique constraint, and the tags screen
 *  keys its `{#each}` on the tag, so a duplicate takes it down with `each_key_duplicate`. */
function assertNotStored(stored: string[], name: string): void {
  if (stored.includes(name)) {
    throw new Error(`tag "${name}" is already in the region's stored vocabulary`)
  }
}

/** An invariant, not a refusal: the callers already answer a missing tag with `region_tagGone`.
 *  Deliberately duplicated with them, because the writers below destroy junction rows
 *  unconditionally and this is the half that still holds for a caller added without the check. */
function assertStored(stored: string[], name: string): void {
  if (!stored.includes(name)) {
    throw new Error(`tag "${name}" is not in the region's stored vocabulary`)
  }
}

/** The region the lock was taken on. Never a caller-supplied id, so a write cannot land on a row
 *  other than the one that was read. */
const regionOf = (writable: WritableKey<'tags'>): number => writable.locked.regionFk

/** Append a word to the vocabulary. Tagged on nothing until somebody applies it. */
export function addTag(db: Tx, writable: WritableKey<'tags'>, name: string) {
  const stored = currentValue(writable)
  assertNotStored(stored, name)

  return writeRegionSettings(db, writable, [...stored, name])
}

/**
 * The losing half of a rename: rows already carrying `to` on a route that also carries `from`. The
 * (route_fk, tag_fk) primary key is not deferrable, so they go before the update.
 *
 * `ne(tagFk, from)` is what makes the statement safe on its own rather than safe because a caller
 * checked: with `from === to` the other clauses match every row carrying the tag, and the delete
 * would strip it off every route.
 */
export function dropSupersededTagRows(db: Tx, regionFk: number, from: string, to: string) {
  return db.delete(routesToTags).where(
    and(
      eq(routesToTags.regionFk, regionFk),
      eq(routesToTags.tagFk, to),
      ne(routesToTags.tagFk, from),
      inArray(
        routesToTags.routeFk,
        db
          .select({ routeFk: routesToTags.routeFk })
          .from(routesToTags)
          .where(and(eq(routesToTags.regionFk, regionFk), eq(routesToTags.tagFk, from))),
      ),
    ),
  )
}

/** Retire a tag, deleting it from every route that carries it. Irreversible, so the screen
 *  confirms with the route count rather than offering an undo. */
export async function removeTag(db: Tx, writable: WritableKey<'tags'>, name: string) {
  const stored = currentValue(writable)
  const regionFk = regionOf(writable)

  // The delete below is unconditional, and a route may carry a tag that already left the
  // vocabulary, so a name this region does not have would destroy real junction rows.
  assertStored(stored, name)

  await db.delete(routesToTags).where(and(eq(routesToTags.regionFk, regionFk), eq(routesToTags.tagFk, name)))

  return writeRegionSettings(
    db,
    writable,
    stored.filter((tag) => tag !== name),
  )
}

/** Rename a tag, carrying it onto every route already tagged with it: a region localising `SD`
 *  to `Sitzstart` must not lose 300 route tags doing it. */
export async function renameTag(db: Tx, writable: WritableKey<'tags'>, from: string, to: string) {
  const stored = currentValue(writable)
  const regionFk = regionOf(writable)

  // Renaming onto a name the vocabulary already has writes a duplicate, and `from === to` is that
  // case, so it is refused here rather than exempted. The statements below survive it either way.
  assertStored(stored, from)
  assertNotStored(stored, to)

  await dropSupersededTagRows(db, regionFk, from, to)

  // `regionFk` keeps the rename inside its own region: two regions may both use `SD`.
  await db
    .update(routesToTags)
    .set({ tagFk: to })
    .where(and(eq(routesToTags.regionFk, regionFk), eq(routesToTags.tagFk, from)))

  return writeRegionSettings(
    db,
    writable,
    stored.map((tag) => (tag === from ? to : tag)),
  )
}

/** How many routes carry each tag. An absent key is a real zero, distinct from "not read yet". */
export async function tagUsage(db: Db, regionFk: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ tag: routesToTags.tagFk, total: count() })
    .from(routesToTags)
    .where(eq(routesToTags.regionFk, regionFk))
    .groupBy(routesToTags.tagFk)

  return Object.fromEntries(rows.map((row) => [row.tag, row.total]))
}
