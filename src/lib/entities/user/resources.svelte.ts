import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toUser } from './mapper'

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
