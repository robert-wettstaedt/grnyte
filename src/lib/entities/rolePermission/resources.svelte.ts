import { collections } from '$lib/powersync/collections'
import { psResource } from '$lib/powersync/resource.svelte'
import { toZeroRow } from '$lib/powersync/rows'
import { toRolePermission, type RolePermissionRow } from './mapper'

/**
 * Every role→permission grant in the app. Reference data shared by all users, synced first, so this resolves
 * from the local store. The global state joins it against the user's role and region memberships to derive
 * their effective permissions.
 */
export function rolePermissionList() {
  return psResource(
    (q) => q.from({ p: collections().role_permissions }),
    [],
    (rows) => rows.map((row) => toRolePermission(toZeroRow<RolePermissionRow>('role_permissions', row))),
    'essentials',
  )
}
