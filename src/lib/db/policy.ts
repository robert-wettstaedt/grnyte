import { REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT, REGION_PERMISSION_READ } from '$lib/auth'
import type { SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { pgPolicy as policy, type PgPolicyConfig } from 'drizzle-orm/pg-core'
import { authenticatedRole, supabaseAuthAdminRole } from 'drizzle-orm/supabase'

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

/** `regionColumn` is for the one table that does not carry a `region_fk`: `regions` itself,
 *  where the region is the row and the column is `regions.id`. */
export const getAuthorizedInRegionPolicyConfig = (
  policyFor: PgPolicyConfig['for'],
  permission: App.Permission,
  regionColumn = 'region_fk',
) => getPolicyConfig(policyFor, sql.raw(`(SELECT authorize_in_region('${permission}', ${regionColumn}))`))

export const getOwnEntryPolicyConfig = (policyFor: PgPolicyConfig['for']) =>
  getPolicyConfig(policyFor, sql.raw('(SELECT auth.uid()) = auth_user_fk'))

/**
 * An activity row the caller wrote themselves, in a region they can still read. `activities`
 * joins `users` to get there because it stores `user_fk`, not `auth_user_fk`.
 *
 * Shared by the own-row delete and the own-row update: it is the same row and the same author,
 * and a security predicate spelled out twice is one edit away from meaning two different things.
 */
export const getOwnActivityPolicyConfig = (policyFor: PgPolicyConfig['for'], permission: App.Permission) =>
  getPolicyConfig(
    policyFor,
    sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND EXISTS (SELECT authorize_in_region('${permission}', region_fk))
        `),
  )

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
