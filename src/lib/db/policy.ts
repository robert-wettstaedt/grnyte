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

/**
 * Refuses a command outright, whatever else permits it.
 *
 * Restrictive rather than permissive, because permissive policies are OR-ed: a table whose other
 * policy is an `all` one for app admins still accepts inserts from them, so "nobody writes this
 * through RLS" would quietly mean "nobody except the role most likely to be asked to". Restrictive
 * policies are AND-ed, so `false` is final.
 *
 * Only for tables whose writes belong to the privileged handle because the operation carries an
 * invariant RLS cannot see: `regions` has to count what a caller already owns before letting them
 * own another.
 */
export const getDeniedPolicyConfig = (policyFor: PgPolicyConfig['for']): PgPolicyConfig => ({
  as: 'restrictive',
  for: policyFor,
  to: authenticatedRole,
  // Postgres rejects USING on an INSERT policy (there is no existing row to filter) and WITH CHECK
  // on SELECT or DELETE (they write no row), so each side is set only where it is legal.
  ...(policyFor === 'insert' ? {} : { using: sql`false` }),
  ...(policyFor === 'select' || policyFor === 'delete' ? {} : { withCheck: sql`false` }),
})

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
 * A row the caller wrote themselves, in a region they can still read. `activities` and
 * `events` both join `users` to get there because they store the app user id, not `auth_user_fk`.
 *
 * Shared by the own-row delete and the own-row update: it is the same row and the same author,
 * and a security predicate spelled out twice is one edit away from meaning two different things.
 * `authorColumn` exists so a table whose author column isn't `user_fk`, like `events.actor_fk`,
 * can reuse this rather than restating it.
 */
export const getOwnRowPolicyConfig = (
  policyFor: PgPolicyConfig['for'],
  permission: App.Permission,
  authorColumn = 'user_fk',
) =>
  getPolicyConfig(
    policyFor,
    sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = ${authorColumn}
              AND u.auth_user_fk = (SELECT auth.uid())
          ) AND (SELECT authorize_in_region('${permission}', region_fk))
        `),
  )

/** {@link getOwnRowPolicyConfig} against `events.actor_fk`, which is the same predicate. */
export const getOwnEventPolicyConfig = (policyFor: PgPolicyConfig['for'], permission: App.Permission) =>
  getOwnRowPolicyConfig(policyFor, permission, 'actor_fk')

/**
 * A row hanging off an event the caller opened themselves, in a region they can still read.
 *
 * `changes` has no author of its own: the actor lives one table up, so ownership has to be read
 * through `event_fk` rather than off the row. Without this the only predicate available is the
 * region one, which would let any member of a region rewrite or delete anybody's diff, or forge
 * "changed grade from 6a to 8c" onto somebody else's event.
 *
 * Every write here is the fold: it inserts changes under the event it just opened, overwrites
 * `new_value` when the same column moves again, and deletes the row when an edit returns to where
 * it started. All three are the same person on their own event, which is exactly this predicate.
 */
export const getOwnEventChildPolicyConfig = (policyFor: PgPolicyConfig['for'], permission: App.Permission) =>
  getPolicyConfig(
    policyFor,
    sql.raw(`
          EXISTS (
            SELECT
              1
            FROM
              public.events e
              JOIN public.users u ON u.id = e.actor_fk
            WHERE
              e.id = event_fk
              AND u.auth_user_fk = (SELECT auth.uid())
              AND e.region_fk = changes.region_fk
          ) AND (SELECT authorize_in_region('${permission}', region_fk))
        `),
  )

/**
 * A reaction or comment the caller is posting as themselves, on an event they can read, filed in
 * that event's region.
 *
 * Three separate things, and dropping any one of them opens a hole. `auth.uid() = auth_user_fk`
 * alone says who is asking but not who the row is attributed to: `user_fk` is what every relation
 * and the whole Zero schema joins on, so without binding the two a caller can post under somebody
 * else's name. The region predicate is what stops a row being filed in a region the caller cannot
 * read. And `e.region_fk = reactions.region_fk` is what stops it being filed in the WRONG region:
 * Zero's region gate filters on the row's own `region_fk`, so a mismatch syncs the row to people
 * who cannot see the event it hangs off, and hides it from those who can.
 *
 * The permission check is a SCALAR subselect, never `EXISTS (SELECT authorize_in_region(...))`.
 * A scalar select returns exactly one row whatever that row says, so `EXISTS` around it is
 * unconditionally true and the region half of the predicate silently disappears. It read as a
 * check and was none, on every own-row policy in this file.
 *
 * That last one MUST qualify the outer column. Written bare, `region_fk` inside the subquery
 * resolves to `events.region_fk` and the test becomes `e.region_fk = e.region_fk`, which is always
 * true. It reads correctly and permits exactly what it was added to prevent, which is how it got
 * through the first time.
 */
export const getOwnReactionPolicyConfig = (policyFor: PgPolicyConfig['for'], permission: App.Permission) =>
  getPolicyConfig(
    policyFor,
    sql.raw(`
          (SELECT auth.uid()) = auth_user_fk
          AND EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = (SELECT auth.uid())
          )
          AND EXISTS (
            SELECT
              1
            FROM
              public.events e
            WHERE
              e.id = event_fk
              AND e.region_fk = reactions.region_fk
          )
          AND (SELECT authorize_in_region('${permission}', region_fk))
        `),
  )

/**
 * A membership row written by somebody with the permission, for somebody who is who the row says.
 *
 * Not the caller: adding other people is the entire point of the table. What has to hold is that the
 * row's two identity columns agree, because `authorize_in_region` resolves permissions through
 * `auth_user_fk` while every relation and the whole app joins on `user_fk`. A row where they name
 * different people is one account silently holding another's rights inside a region, displayed under
 * the wrong name in the member list.
 *
 * WITH CHECK only, deliberately. It is a rule about the row being COMPOSED, and putting it in USING
 * as well makes an already-inconsistent row unreachable: an admin could not demote its holder and
 * could not delete it either, while the handlers, which key their UPDATE on the row's id and never
 * read the affected count, would report both as done. The predicate exists to stop such a row being
 * written, not to hide the ones that already were.
 */
export const getConsistentMemberPolicyConfig = (
  policyFor: PgPolicyConfig['for'],
  permission: App.Permission,
): PgPolicyConfig => ({
  ...getPolicyConfig(policyFor, sql.raw(`(SELECT authorize_in_region('${permission}', region_fk))`)),
  withCheck: sql.raw(`
          (SELECT authorize_in_region('${permission}', region_fk))
          AND EXISTS (
            SELECT
              1
            FROM
              public.users u
            WHERE
              u.id = user_fk
              AND u.auth_user_fk = region_members.auth_user_fk
          )
        `),
})

/**
 * `omit` drops the commands no code path performs. A policy is a standing permission, so one nothing
 * exercises is surface with no purpose: it cannot break anything by being absent today, and it is
 * the thing that has to be right if somebody reaches for the table tomorrow. Leaving it out means a
 * future writer adds it deliberately rather than inheriting it.
 */
export const createBasicTablePolicies = (
  tableName: string,
  // Write commands only: the read policy is what every caller of this wants, and `all` is not one of
  // the four it emits, so neither belongs in a list saying what to leave out.
  omit: Exclude<PgPolicyConfig['for'], 'all' | 'select'>[] = [],
) =>
  [
    policy(
      `${REGION_PERMISSION_READ} can read ${tableName}`,
      getAuthorizedInRegionPolicyConfig('select', REGION_PERMISSION_READ),
    ),
    omit.includes('insert')
      ? undefined
      : policy(
          `${REGION_PERMISSION_EDIT} can insert ${tableName}`,
          getAuthorizedInRegionPolicyConfig('insert', REGION_PERMISSION_EDIT),
        ),
    omit.includes('update')
      ? undefined
      : policy(
          `${REGION_PERMISSION_EDIT} can update ${tableName}`,
          getAuthorizedInRegionPolicyConfig('update', REGION_PERMISSION_EDIT),
        ),
    omit.includes('delete')
      ? undefined
      : policy(
          `${REGION_PERMISSION_DELETE} can delete ${tableName}`,
          getAuthorizedInRegionPolicyConfig('delete', REGION_PERMISSION_DELETE),
        ),
  ].filter((entry) => entry != null)
