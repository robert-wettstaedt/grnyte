import { regions } from '$lib/db/schema'
import { entityHref } from '$lib/entities/href'
import { formError } from '$lib/forms/schemas'
import type * as z from '$lib/forms/zod'
import type { Context } from '$lib/remote/authed.server'
import { error, invalid } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'
import type { regionActionSchema, regionMapLayersSchema, regionTagSchema, renameRegionTagSchema } from './dto'
import { canEditRegion, canReadRegion } from './permissions'
import { mapLayersFingerprint } from './settings'
import { currentValue, lockRegionSettings, writableKey, writeRegionSettings, type WritableKey } from './settings.server'
import { addTag, removeTag, renameTag } from './tags.server'
import { MAX_TAGS } from './tagVocabulary'

type Caller = Pick<Context, 'db' | 'userRegions'>

/** Add a word to a region's route-tag vocabulary. Tagged on nothing until somebody applies it. */
export async function addRegionTagRow({ name, regionFk }: z.output<typeof regionTagSchema>, ctx: Caller) {
  const writable = await lockEditableTags(ctx, regionFk)
  const stored = currentValue(writable)

  // Nothing else catches this: a jsonb array has no unique constraint.
  if (stored.includes(name)) {
    error(409, formError('region_tagDuplicate'))
  }

  if (stored.length >= MAX_TAGS) {
    error(409, formError('region_tagsTooMany', { count: MAX_TAGS }))
  }

  assertWritten(await addTag(ctx.db, writable, name))
}

/** Throws unless the caller may administer `regionFk`. */
export function assertCanEdit({ userRegions }: Pick<Context, 'userRegions'>, regionFk: number) {
  if (!canEditRegion(userRegions, regionFk)) {
    error(403, formError('form_noPermission'))
  }
}

/** Throws unless the caller is a reading member of `regionFk`. For the reads every member is
 *  entitled to, as opposed to the administrative ones {@link assertCanEdit} guards. */
export function assertIsMember({ userRegions }: Pick<Context, 'userRegions'>, regionFk: number) {
  if (!canReadRegion(userRegions, regionFk)) {
    error(403, formError('form_noPermission'))
  }
}

/** Retire a tag, deleting it from every route that carries it. See {@link removeTag}. */
export async function removeRegionTagRow({ name, regionFk }: { name: string; regionFk: number }, ctx: Caller) {
  const writable = await lockEditableTags(ctx, regionFk)
  const stored = currentValue(writable)

  // The delete underneath is unconditional, so a name this region does not have would take
  // real junction rows with it.
  if (!stored.includes(name)) {
    error(404, formError('region_tagGone'))
  }

  assertWritten(await removeTag(ctx.db, writable, name))
}

/** Rename a tag, carrying it onto every route already tagged with it. See {@link renameTag}. */
export async function renameRegionTagRow({ from, regionFk, to }: z.output<typeof renameRegionTagSchema>, ctx: Caller) {
  const writable = await lockEditableTags(ctx, regionFk)
  const stored = currentValue(writable)

  if (!stored.includes(from)) {
    error(404, formError('region_tagGone'))
  }

  if (from === to) {
    return
  }

  if (stored.includes(to)) {
    error(409, formError('region_tagDuplicate'))
  }

  assertWritten(await renameTag(ctx.db, writable, from, to))
}

/**
 * Replace a region's WMS map overlays. Removing them all is legitimate, so an empty submission is
 * indistinguishable from a form that rendered before its data arrived: the payload has to prove
 * which layers it replaces. A fingerprint and not a count, because a delete plus an add leaves
 * three as three.
 */
export async function updateRegionMapLayersRow(
  { id, known, mapLayers }: z.output<typeof regionMapLayersSchema>,
  ctx: Caller,
) {
  const { db } = ctx

  // Membership first, so a non-admin is told so: the lock cannot say, since Postgres applies the
  // update policy to `for update` and a non-admin simply sees no row.
  if (!canEditRegion(ctx.userRegions, id)) {
    invalid(formError('form_noPermission'))
  }

  // Locked, not merely read. Also what makes a missing row safe: an absent blob reads as complete
  // and empty, so a matching `known` once answered a write against nothing with a success.
  const locked = await lockRegionSettings(db, id)
  if (locked == null) {
    invalid(formError('region_notFound'))
  }

  // Two refusals, two answers: an unreadable blob is not "someone else changed this", and that
  // message would send the admin round a loop reopening cannot leave.
  const writable = writableKey(locked, 'mapLayers')
  if (writable == null) {
    invalid(formError('region_mapLayersUnreadableBody'))
  }

  // The lock stops a concurrent writer; this stops a stale HUMAN, whose form rendered before
  // somebody else's save. Holding the row says nothing about what was on their screen.
  if (mapLayersFingerprint(currentValue(writable)) !== known) {
    invalid(formError('region_mapLayersStale'))
  }

  if ((await writeRegionSettings(db, writable, mapLayers)) === 'zero') {
    // The row went away, or an admin was demoted mid-request. Both read as gone here; the next
    // request re-reads `userRegions` and refuses with `form_noPermission`.
    invalid(formError('region_notFound'))
  }

  return { redirectTo: entityHref('regions', id) }
}

export async function updateRegionRow({ id, name }: z.output<typeof regionActionSchema>, { db, userRegions }: Caller) {
  if (!canEditRegion(userRegions, id)) {
    invalid(formError('form_noPermission'))
  }

  // One statement: `returning` says whether the row was there, and under RLS an invisible
  // region is the same "not found" either way.
  const [updated] = await db.update(regions).set({ name }).where(eq(regions.id, id)).returning({ id: regions.id })

  if (updated == null) {
    error(404, formError('region_notFound'))
  }

  // No event row: object columns have no 'region' member, and the feed renders content changes.

  return { redirectTo: entityHref('regions', id) }
}

/** Throws unless a settings write actually landed. Silence was the old behaviour and the worst
 *  one: the junction rows had already moved, so a retired tag vanished while the screen showed it. */
function assertWritten(outcome: 'ok' | 'zero') {
  if (outcome === 'zero') {
    error(404, formError('region_notFound'))
  }
}

/**
 * Lock the region's row and return permission to rewrite its vocabulary, which comes back on the
 * proof rather than from `ctx.userRegions`: the hook parses that on another connection, so two
 * admins adding a tag at once each wrote a stale copy back and the second erased the first's word.
 *
 * Membership is checked before the lock, which cannot tell "gone" from "not allowed".
 */
async function lockEditableTags(ctx: Caller, regionFk: number): Promise<WritableKey<'tags'>> {
  assertCanEdit(ctx, regionFk)

  const locked = await lockRegionSettings(ctx.db, regionFk)
  if (locked == null) {
    error(404, formError('region_notFound'))
  }

  // Refused before any junction row moves. A blob this build cannot read whole would have its
  // real tags permanently replaced by whatever was readable.
  const writable = writableKey(locked, 'tags')
  if (writable == null) {
    error(409, formError('region_tagsUnreadable'))
  }

  return writable
}
