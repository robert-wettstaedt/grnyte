/**
 * The database half of editing a region's route-tag vocabulary.
 *
 * Split out of `regions.remote.ts` for the same reason as `guards.server.ts`: these are the
 * statements that move and destroy `routes_to_tags` rows, and a mock would test nothing. The remote
 * functions keep the permission checks and the refusals; this keeps the SQL.
 *
 * Every function takes the region's current vocabulary rather than reading it, because the caller
 * has already read it from the request's own memberships. That is what keeps each one additive: it
 * touches the tag it was handed by name and leaves the rest of the list alone.
 */
import * as schema from '$lib/db/schema'
import { regions, routesToTags } from '$lib/db/schema'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

// The base connection type rather than `Context['db']`, the same way `guards.server.ts` does it:
// production passes the RLS transaction, the tests pass the superuser pool.
type Db = PostgresJsDatabase<typeof schema>

/** The other half, for the writers that ADD a name. The vocabulary is a jsonb array with no unique
 *  constraint, and `tags/+page.svelte` keys its `{#each}` on the tag, so a duplicate takes the
 *  screen down with `each_key_duplicate` rather than showing twice. Same reasoning as
 *  {@link assertStored}: the caller refuses first, this holds if one is added that does not. */
function assertNotStored(stored: string[], name: string): void {
  if (stored.includes(name)) {
    throw new Error(`tag "${name}" is already in the region's stored vocabulary`)
  }
}

/** An invariant, not a refusal: this module keeps the SQL and the remote functions keep the
 *  refusals, so by the time either writer below runs the caller has already answered a missing
 *  tag with `region_tagGone`. Both of them move or destroy `routes_to_tags` rows unconditionally,
 *  which is irreversible, so they assert rather than trust it. Throws a plain error because
 *  reaching it is a bug in the caller, not something to render.
 *
 *  Deliberately duplicated with those callers' checks, not left over from them: three separate
 *  reviewers have now read this pair and proposed deleting one half as redundant. It is not
 *  redundant, it is the half that still holds when a caller is added without one. */
function assertStored(stored: string[], name: string): void {
  if (!stored.includes(name)) {
    throw new Error(`tag "${name}" is not in the region's stored vocabulary`)
  }
}

/**
 * Write one key of a region's `settings`. Merged rather than assigned: `settings` is one jsonb blob
 * and each settings screen owns a single key of it, so a key added to `RegionSettings` later cannot
 * be wiped by an older screen.
 */
const writeTags = (db: Db, regionFk: number, tags: string[]) =>
  db
    .update(regions)
    .set({ settings: sql`coalesce(${regions.settings}, '{}'::jsonb) || ${JSON.stringify({ tags })}::jsonb` })
    .where(eq(regions.id, regionFk))

/** Append a word to the vocabulary. Tagged on nothing until somebody applies it. */
export function addTag(db: Db, regionFk: number, stored: string[], name: string) {
  assertNotStored(stored, name)

  return writeTags(db, regionFk, [...stored, name])
}

/**
 * Retire a tag, deleting it from every route in the region that carries it. Irreversible, which is
 * why the screen confirms with the route count rather than offering an undo: putting the junction
 * rows back would collide on that same primary key after any later rename onto the freed name.
 */
export async function removeTag(db: Db, regionFk: number, stored: string[], name: string) {
  // Belt and braces under the caller's refusal. The delete below is unconditional and
  // irreversible, and a route may carry a tag that has already left the vocabulary (see
  // `renameTag`), so a name this region does not have would destroy real junction rows for it.
  // Throws rather than returning: a quiet no-op here would report success for a deletion that
  // never happened.
  assertStored(stored, name)

  await db.delete(routesToTags).where(and(eq(routesToTags.regionFk, regionFk), eq(routesToTags.tagFk, name)))

  await writeTags(
    db,
    regionFk,
    stored.filter((tag) => tag !== name),
  )
}

/**
 * Rename a tag, carrying it onto every route already tagged with it. That is the point: a region
 * localising `SD` to `Sitzstart` must not lose 300 route tags doing it.
 */
export async function renameTag(db: Db, regionFk: number, stored: string[], from: string, to: string) {
  // The same backstop as `removeTag`: this deletes junction rows and mass-updates the rest, so it
  // must not run for a name the region does not have, whatever the screen above believed. Both
  // ends, because renaming onto a name already in the vocabulary writes a duplicate.
  //
  // `assertNotStored` is deliberately unconditional. Exempting `from === to` looked like a
  // harmless no-op and was the opposite: the delete below matches `tagFk = to` among the routes
  // carrying `from`, so a self-rename deletes every junction row for that tag, the update then
  // touches nothing, and the vocabulary is written back unchanged. The tag stays on screen and is
  // gone from every route. A self-rename refuses here by construction, since `to` is stored.
  assertStored(stored, from)
  assertNotStored(stored, to)

  // `routes_to_tags`' (route_fk, tag_fk) primary key is not deferrable, and a route can carry a tag
  // that has already left the vocabulary: `updateRoute` widens its allowlist with the route's own
  // current tags, so an edit cannot strip one the region retired mid-session. So `to` may already
  // sit on a route that also carries `from`, and the rename has to drop the loser first or collide.
  // Checking the vocabulary alone is not enough to rule this out.
  await db.delete(routesToTags).where(
    and(
      eq(routesToTags.regionFk, regionFk),
      eq(routesToTags.tagFk, to),
      inArray(
        routesToTags.routeFk,
        db
          .select({ routeFk: routesToTags.routeFk })
          .from(routesToTags)
          .where(and(eq(routesToTags.regionFk, regionFk), eq(routesToTags.tagFk, from))),
      ),
    ),
  )

  // The `regionFk` predicate is what keeps a rename inside its own region: two regions may
  // legitimately both use the string `SD`, and only the renaming region's rows move.
  await db
    .update(routesToTags)
    .set({ tagFk: to })
    .where(and(eq(routesToTags.regionFk, regionFk), eq(routesToTags.tagFk, from)))

  await writeTags(
    db,
    regionFk,
    stored.map((tag) => (tag === from ? to : tag)),
  )
}

/**
 * How many routes carry each of a region's tags. A tag no route carries has no key, so an absent
 * key is a real zero and stays distinguishable from a count that has not been read yet.
 */
export async function tagUsage(db: Db, regionFk: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ tag: routesToTags.tagFk, total: count() })
    .from(routesToTags)
    .where(eq(routesToTags.regionFk, regionFk))
    .groupBy(routesToTags.tagFk)

  return Object.fromEntries(rows.map((row) => [row.tag, row.total]))
}
