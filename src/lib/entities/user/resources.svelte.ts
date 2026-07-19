import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toUser, toUserListItem } from './mapper'

export interface UserListFilter {
  content?: string
  limit?: number
  /** Users active in any of these regions; empty matches none. */
  regionFks: number[]
}

export function currentUser() {
  return createResource(
    () => queries.currentUser(),
    (row) => (row == null ? undefined : toUser(row)),
  )
}

/** The signed-in user's app/region role, or `undefined` if they have none. */
export function currentUserRole() {
  return createResource(
    () => queries.currentUserRole(),
    (row) => row?.role,
  )
}

/** A single user's id + username by id — the public profile header. */
export function userById(id: () => number) {
  return createResource(
    () => queries.usersByIds({ id: [id()] }),
    (rows) => (rows[0] == null ? undefined : { id: rows[0].id, username: rows[0].username }),
  )
}

/** Users matching a search, across the given regions. */
export function userList(filter: () => UserListFilter, opts?: { enabled?: () => boolean }) {
  return createResource(
    () => queries.listUsers(filter()),
    (rows) => rows.map(toUserListItem),
    opts,
  )
}
