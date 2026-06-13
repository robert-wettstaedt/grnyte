import { queries } from '$lib/zero/queries'
import { createResource } from '$lib/zero/resource.svelte'
import { toRolePermission } from './mapper'

/**
 * Every role→permission grant in the app. Reference data shared by all users
 * and preloaded in `initZero`, so this resolves from the local store. The
 * global state joins it against the user's role and region memberships to
 * derive their effective permissions.
 */
export function rolePermissionList() {
  return createResource(
    () => queries.listRolePermissions(),
    (rows) => rows.map(toRolePermission),
  )
}
