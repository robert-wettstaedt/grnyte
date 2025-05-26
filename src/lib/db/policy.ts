import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { pgPolicy as policy, type PgPolicyConfig } from 'drizzle-orm/pg-core'
import { authenticatedRole, supabaseAuthAdminRole } from 'drizzle-orm/supabase'
import { REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '../auth'

export const READ_AUTH_ADMIN_POLICY_CONFIG: PgPolicyConfig = {
  as: 'permissive',
  for: 'select',
  to: supabaseAuthAdminRole,
  using: sql`true`,
}

export const getPolicyConfig = (policyFor: PgPolicyConfig['for'], check: SQL): PgPolicyConfig => {
  const config: PgPolicyConfig = { for: policyFor, to: authenticatedRole }

  switch (policyFor) {
    case 'insert':
      config.withCheck = check
      break

    case 'all':
    case 'update':
      config.using = check
      config.withCheck = check
      break

    default:
      config.using = check
  }

  return config
}

export const getAuthorizedPolicyConfig = (policyFor: PgPolicyConfig['for'], permission: App.Permission) =>
  getPolicyConfig(policyFor, sql.raw(`(SELECT authorize('${permission}'))`))

export const getAuthorizedInRegionPolicyConfig = (policyFor: PgPolicyConfig['for'], permission: App.Permission) =>
  getPolicyConfig(policyFor, sql.raw(`(SELECT authorize_in_region('${permission}', region_fk))`))

export const getOwnEntryPolicyConfig = (policyFor: PgPolicyConfig['for']) =>
  getPolicyConfig(policyFor, sql.raw('(SELECT auth.uid()) = auth_user_fk'))

export const createBasicTablePolicies = (tableName: string) => [
  policy(
    `${REGION_PERMISSION_READ} can read ${tableName}`,
    getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
  ),
  policy(
    `${REGION_PERMISSION_EDIT} can insert ${tableName}`,
    getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_EDIT),
  ),
  policy(
    `${REGION_PERMISSION_EDIT} can update ${tableName}`,
    getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_EDIT),
  ),
  policy(
    `${REGION_PERMISSION_DELETE} can delete ${tableName}`,
    getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_DELETE),
  ),
]
