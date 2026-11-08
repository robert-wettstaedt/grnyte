import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { eq, toArray } from '@tanstack/db'
import { toFirstAscensionist, type FirstAscensionistRow } from './mapper'

/** A synced first ascensionist with its linked user, as `toFirstAscensionist` reads it. */
export const toFirstAscensionistRow = (row: { user: object[] }): FirstAscensionistRow => ({
  ...toZeroRow<FirstAscensionistRow>('first_ascensionists', row),
  user: row.user[0] && toZeroRow<NonNullable<FirstAscensionistRow['user']>>('users', row.user[0]),
})

/**
 * First ascensionists ordered by name: all of the user's regions by default,
 * or one region when `regionFk` is set (e.g. the route form's picker).
 */
export function firstAscensionistList(filter: () => { regionFk?: number } = () => ({})) {
  return psResource(
    (q) => {
      const { regionFk } = filter()
      let query = q.from({ fa: collections().first_ascensionists })
      if (regionFk != null) query = query.where(({ fa }) => eq(fa.region_fk, regionFk))
      return query
        .orderBy(({ fa }) => fa.name, 'asc')
        .orderBy(({ fa }) => fa.nid, 'asc')
        .select(({ fa }) => ({
          ...fa,
          user: toArray(q.from({ u: collections().users }).where(({ u }) => eq(u.nid, fa.user_fk))),
        }))
    },
    [() => filter().regionFk],
    (rows) => rows.map((row) => toFirstAscensionist(toFirstAscensionistRow(row))),
    ['guidebook', 'members'],
  )
}

/**
 * The first-ascensionist rows linked to a user (usually one): the ids feed the
 * route FA filter, the names the profile header.
 */
export function userFirstAscensionists(userId: () => number | undefined) {
  return psResource(
    (q) =>
      q
        .from({ fa: collections().first_ascensionists })
        .where(({ fa }) => eq(fa.user_fk, userId() ?? -1))
        .orderBy(({ fa }) => fa.nid, 'asc'),
    [userId],
    (rows) =>
      rows.map((synced) => {
        const row = toZeroRow<FirstAscensionistRow>('first_ascensionists', synced)
        return { id: row.id, name: row.name }
      }),
    'guidebook',
    { enabled: () => userId() != null },
  )
}
