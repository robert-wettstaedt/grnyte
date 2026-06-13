import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import type { RolePermission } from './dto'

export type RolePermissionRow = QueryRow<typeof queries.listRolePermissions>

export function toRolePermission(row: RolePermissionRow): RolePermission {
  return {
    role: row.role,
    permission: row.permission,
  }
}
