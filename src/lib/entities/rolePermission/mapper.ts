import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { AppRole, RolePermission } from './dto'

export type RolePermissionRow = QueryRow<typeof queries.listRolePermissions>

/** Display name of a role. `app_admin` is app-wide and never shown in a region's member
 *  list, so it falls back to the plain admin label rather than getting its own copy. */
export function roleLabel(role: AppRole): string {
  switch (role) {
    case 'region_maintainer':
      return m.roles_maintainer()
    case 'region_user':
      return m.roles_user()
    default:
      return m.roles_admin()
  }
}

export function toRolePermission(row: RolePermissionRow): RolePermission {
  return {
    permission: row.permission,
    role: row.role,
  }
}
