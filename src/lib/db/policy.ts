import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { pgPolicy as policy, type PgPolicyConfig } from 'drizzle-orm/pg-core'
import { authenticatedRole, supabaseAuthAdminRole } from 'drizzle-orm/supabase'
import { DELETE_PERMISSION, EDIT_PERMISSION, READ_PERMISSION } from '../auth'

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

export const getAuthorizedPolicyConfig = (
  policyFor: PgPolicyConfig['for'],
  permission: typeof EDIT_PERMISSION | typeof READ_PERMISSION | typeof DELETE_PERMISSION,
) => getPolicyConfig(policyFor, sql.raw(`(SELECT authorize('${permission}'))`))

export const getOwnEntryPolicyConfig = (policyFor: PgPolicyConfig['for']) =>
  getPolicyConfig(policyFor, sql.raw('(SELECT auth.uid()) = auth_user_fk'))

export const createBasicTablePolicies = (tableName: string) => [
  policy(`${READ_PERMISSION} can read ${tableName}`, getAuthorizedPolicyConfig('select', READ_PERMISSION)),
  policy(`${EDIT_PERMISSION} can insert ${tableName}`, getAuthorizedPolicyConfig('insert', EDIT_PERMISSION)),
  policy(`${EDIT_PERMISSION} can update ${tableName}`, getAuthorizedPolicyConfig('update', EDIT_PERMISSION)),
  policy(`${DELETE_PERMISSION} can delete ${tableName}`, getAuthorizedPolicyConfig('delete', DELETE_PERMISSION)),
]
