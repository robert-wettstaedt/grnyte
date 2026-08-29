import { formError } from '$lib/forms/schemas'
import * as z from '$lib/forms/zod'
import type { RegionMembership } from './dto'

/**
 * The vocabulary route tags started out as, before regions owned their own. Every region that
 * existed when they became region-based was frozen at its real list by migration 0089, so this is
 * only what a region created afterwards starts with.
 */
export const DEFAULT_TAGS = ['SD', 'benchmark', 'defined', 'high', 'project', 'trav-l-r', 'trav-r-l']

/**
 * Ceiling on a region's vocabulary. Both pickers are flat chip walls with no search, and every tag
 * syncs to every device in the region, so there is a point past which the feature stops being
 * usable rather than slow.
 */
export const MAX_TAGS = 30

/**
 * One tag as the settings form submits it. Short because it renders inside a chip, and comma-free
 * because the map filter encodes a selection as `?tags=a,b` and `parseRouteFilter` splits it back
 * apart. Not `nameSchema`: its minimum of 3 would reject the `SD` default.
 */
export const tagNameSchema = z.string({ error: formError('form_required') }).check(
  z.trim(),
  z.minLength(1, { error: formError('form_required') }),
  z.maxLength(30, { error: formError('form_charsMax', { count: 30 }) }),
  z.refine((value) => !value.includes(','), { error: formError('region_tagComma') }),
)

/**
 * Every tag name the caller's memberships put in reach, as one sorted list. Deduped, and not only
 * for tidiness: two regions using the same word would make a keyed `each` over the result throw
 * `each_key_duplicate`.
 */
export function allRegionTags(userRegions: RegionMembership[]): string[] {
  return [...new Set(userRegions.flatMap((region) => region.settings?.tags ?? DEFAULT_TAGS))].sort()
}

/**
 * The tag vocabulary a region's admins have defined, for any caller holding the signed-in user's
 * memberships: `global.userRegions` on the client, `ctx.userRegions` on the server.
 *
 * A region the caller is not a member of has no vocabulary, rather than the defaults. That matters
 * because this doubles as the allowlist on the route write path, and a not-found branch returning
 * the defaults would hand a non-member seven writable tags.
 */
export function regionTags(userRegions: RegionMembership[], regionFk: number): string[] {
  const membership = userRegions.find((region) => region.regionFk === regionFk)
  return membership == null ? [] : (membership.settings?.tags ?? DEFAULT_TAGS)
}
