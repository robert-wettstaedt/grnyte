import type { Row } from '$lib/zero/types'

/** A role a member can hold, app-wide or within a region. */
export type AppRole = Row<'rolePermissions'>['role']

/** Roles that can actually be assigned to somebody, which is every role except `app_admin`:
 *  that one is app-wide and granted out of band, never through a region's member list.
 *  `satisfies` keeps it honest if the `app_role` enum ever loses a value. */
export const assignableRoles = [
  'region_user',
  'region_maintainer',
  'region_admin',
] as const satisfies readonly AppRole[]

export type AssignableRole = (typeof assignableRoles)[number]

/** A permission granted to a role, region- or app-scoped. */
export type Permission = Row<'rolePermissions'>['permission']

/** A single role→permission grant from the `rolePermissions` reference table. */
export interface RolePermission {
  permission: Permission
  role: AppRole
}
