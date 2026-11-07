import { compareNames } from '$lib/i18n/collator'
import { collections } from '$lib/powersync/collections'
import { psResource, signedInAuthId } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { and, eq, toArray } from '@tanstack/db'
import {
  toRegionDetail,
  toRegionMemberItem,
  toRegionMembership,
  type RegionDetailRow,
  type RegionMemberRow,
} from './mapper'

/** A single region's own record, for its settings screen. Only the reader's own regions sync, so no membership check. */
export function regionDetail(id: () => number) {
  return psResource(
    (q) =>
      q
        .from({ r: collections().regions })
        .where(({ r }) => eq(r.nid, id()))
        .select(({ r }) => ({
          ...r,
          author: toArray(q.from({ u: collections().users }).where(({ u }) => eq(u.nid, r.created_by))),
        })),
    [id],
    ([row]) =>
      row == null
        ? undefined
        : toRegionDetail({
            ...toZeroRow<RegionDetailRow>('regions', row),
            author: row.author[0] && toZeroRow<RegionDetailRow['author']>('users', row.author[0]),
          }),
    // The owner's user row comes with the co-members, after the region's own row.
    'members',
  )
}

/**
 * Active members of a region, with the username of whoever invited each of them.
 * Sorted here rather than in the query: Zero cannot order by a related table's column,
 * and without a sort a role change re-syncs the row to a different position.
 */
export function regionMemberList(regionFk: () => number) {
  return createResource(
    () => queries.listRegionMembers({ regionFk: regionFk() }),
    (rows) => rows.map(toRegionMemberItem).sort((a, b) => compareNames(a.username, b.username)),
  )
}

/**
 * The signed-in user's active region memberships, each with its region's name and settings. The global state
 * layers on the permissions granted by each membership's role. Sorted by name so the settings list and the region
 * picker keep a stable order.
 */
export function userRegionList() {
  const authId = signedInAuthId()
  return psResource(
    (q) =>
      q
        .from({ m: collections().region_members })
        .where(({ m }) => and(eq(m.auth_user_fk, authId()), eq(m.is_active, 1)))
        .select(({ m }) => ({
          ...m,
          region: toArray(q.from({ r: collections().regions }).where(({ r }) => eq(r.nid, m.region_fk))),
        })),
    [authId],
    (rows) =>
      rows
        .map((row) =>
          toRegionMembership({
            ...toZeroRow<RegionMemberRow>('region_members', row),
            region: row.region[0] && toZeroRow<RegionMemberRow['region']>('regions', row.region[0]),
          }),
        )
        .sort((a, b) => compareNames(a.name, b.name)),
    'essentials',
  )
}
