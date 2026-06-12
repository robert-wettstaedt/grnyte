import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toUser } from './mapper'

export function currentUser() {
  return createResource(
    () => queries.currentUser(),
    (row) => (row == null ? undefined : toUser(row)),
  )
}
