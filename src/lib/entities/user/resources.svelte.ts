import type { AppRole } from '$lib/entities/rolePermission/dto'
import { compareNames } from '$lib/i18n/collator'
import { collections } from '$lib/powersync/collections'
import { psResource, signedInAuthId } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { and, eq, inArray, toArray } from '@tanstack/db'
import { toUser, toUserListItem, toUserRef, type CurrentUserRow, type UserListRow, type UserRefRow } from './mapper'

export interface UserListFilter {
  content?: string
  /** Narrow to specific users, still inside `regionFks`. */
  ids?: number[]
  limit?: number
  /** Users active in any of these regions; empty matches none. */
  regionFks: number[]
}

export function currentUser() {
  const authId = signedInAuthId()
  return psResource(
    (q) =>
      q
        .from({ u: collections().users })
        .where(({ u }) => eq(u.auth_user_fk, authId()))
        .select(({ u }) => ({
          ...u,
          settings: toArray(q.from({ s: collections().user_settings }).where(({ s }) => eq(s.nid, u.user_settings_fk))),
        })),
    [authId],
    ([row]) =>
      row == null
        ? undefined
        : toUser({
            ...toZeroRow<CurrentUserRow>('users', row),
            userSettings:
              row.settings[0] && toZeroRow<CurrentUserRow['userSettings']>('user_settings', row.settings[0]),
          }),
    'essentials',
  )
}

/** The signed-in user's app/region role, or `undefined` if they have none. */
export function currentUserRole() {
  const authId = signedInAuthId()
  return psResource(
    (q) => q.from({ r: collections().user_roles }).where(({ r }) => eq(r.auth_user_fk, authId())),
    [authId],
    ([row]) => row?.role as AppRole | undefined,
    'essentials',
  )
}

/** A single user's id + username by id: the public profile header. Only co-members sync, which is who may see one. */
export function userById(id: () => number) {
  return psResource(
    (q) => q.from({ u: collections().users }).where(({ u }) => eq(u.nid, id())),
    [id],
    ([row]) => (row == null ? undefined : toUserRef(toZeroRow<UserRefRow>('users', row))),
    'members',
  )
}

/**
 * Users matching a search, across the given regions, by name. Matched in JS with `toLocaleLowerCase`, as Postgres's
 * ILIKE did: SQLite's LIKE folds ASCII only, so "jürgen" would miss "Jürgen".
 */
export function userList(filter: () => UserListFilter, opts?: { enabled?: () => boolean }) {
  // A string, so typing (text only) rebuilds no live query.
  const regions = $derived(filter().regionFks.join())
  const regionFks = () => (regions === '' ? [] : regions.split(',').map(Number))
  return psResource(
    (q) =>
      q.from({ u: collections().users }).select(({ u }) => ({
        ...u,
        memberships: toArray(
          q
            .from({ m: collections().region_members })
            .where(({ m }) => and(eq(m.user_fk, u.nid), eq(m.is_active, 1), inArray(m.region_fk, regionFks()))),
        ),
      })),
    [() => regions],
    (rows) => {
      const { content, ids, limit } = filter()
      const needle = content?.toLocaleLowerCase()
      return rows
        .filter((row) => row.memberships.length > 0)
        .map((row) =>
          toUserListItem({
            ...toZeroRow<UserListRow>('users', row),
            regionMemberships: row.memberships.map((m) =>
              toZeroRow<UserListRow['regionMemberships'][number]>('region_members', m),
            ),
          }),
        )
        .filter((user) => needle == null || user.username.toLocaleLowerCase().includes(needle))
        .filter((user) => ids == null || ids.includes(user.id))
        .sort((a, b) => compareNames(a.username, b.username))
        .slice(0, limit)
    },
    ['members', 'region_activity'],
    opts,
  )
}

export function usersByIds(ids: () => number[]) {
  return psResource(
    (q) => q.from({ u: collections().users }).where(({ u }) => inArray(u.nid, ids())),
    [ids],
    (rows) => rows.map((row) => toUserRef(toZeroRow<UserRefRow>('users', row))),
    'members',
    { enabled: () => ids().length > 0 },
  )
}
