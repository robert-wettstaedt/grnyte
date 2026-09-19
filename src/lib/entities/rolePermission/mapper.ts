import type { MessageOptions } from '$lib/i18n/message'
import { m } from '$lib/paraglide/messages'
import { queries } from '$lib/zero/queries'
import type { QueryRow } from '$lib/zero/types'
import { assignableRoles, type AppRole, type RolePermission } from './dto'

export type RolePermissionRow = QueryRow<typeof queries.listRolePermissions>

/** Display name of a role. `app_admin` is app-wide and never shown in a region's member
 *  list, so it falls back to the plain admin label rather than getting its own copy.
 *
 *  `options` exists for the push cron, which renders one sentence per recipient in whichever
 *  language that account is written to. Without it the role name inside an otherwise German
 *  sentence comes out in whatever locale the cron's own request resolved to. */
export function roleLabel(role: AppRole, options?: MessageOptions): string {
  switch (role) {
    case 'region_maintainer':
      return m.roles_maintainer({}, options)
    case 'region_user':
      return m.roles_user({}, options)
    default:
      return m.roles_admin({}, options)
  }
}

/**
 * The label for a role that came out of storage rather than out of the enum, or `undefined`
 * when it is not a role this app assigns.
 *
 * {@link roleLabel} answers "Admin" for anything it does not recognise, which is right for an
 * `AppRole` and wrong for a string read back out of storage: a typo, a retired role or `app_admin`
 * itself would all read as a promotion. The guard belongs here, with the function whose
 * fallback makes it necessary, rather than at each call site that handles stored values.
 */
export function roleLabelFor(value: string | undefined, options?: MessageOptions): string | undefined {
  return value != null && (assignableRoles as readonly string[]).includes(value)
    ? roleLabel(value as AppRole, options)
    : undefined
}

export function toRolePermission(row: RolePermissionRow): RolePermission {
  return {
    permission: row.permission,
    role: row.role,
  }
}
