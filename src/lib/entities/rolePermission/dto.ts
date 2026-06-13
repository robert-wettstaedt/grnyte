import type { Row } from '$lib/zero/types'

/** A role a member can hold, app-wide or within a region. */
export type AppRole = Row<'rolePermissions'>['role']

/** A permission granted to a role — region- or app-scoped. */
export type Permission = Row<'rolePermissions'>['permission']

/** A single role→permission grant from the `rolePermissions` reference table. */
export interface RolePermission {
  role: AppRole
  permission: Permission
}
