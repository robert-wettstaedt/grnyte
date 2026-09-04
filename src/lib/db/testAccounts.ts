/**
 * Teardown for accounts a test made. Separate from `testDb.ts` so importing it does not open that
 * module's shared pool: the sign-up canary points at production.
 */
import 'dotenv/config'
import postgres, { type Sql } from 'postgres'

/** A pool of its own, for a caller that cannot share `testDb`'s. */
export function connect(): Sql {
  return postgres(process.env.DATABASE_URL ?? '', { connect_timeout: 5, max: 2, prepare: false })
}

/**
 * The rows a spec leaves on an account, in FK order, then its `public.users` row. `auth.users` is
 * the caller's, through GoTrue's admin API.
 *
 * Throwaway accounts only: deleting their events cascades to the changes, reactions and
 * notifications hanging off them, whoever wrote those. Content tables (routes, areas, blocks,
 * ascents, files, favorites, feedback) are deliberately absent, so a `users` delete that would
 * take real data with it fails 23503 instead.
 */
export async function deleteAccountRows(client: Sql, authUserIds: string[]): Promise<void> {
  if (authUserIds.length === 0) return

  // Nested subqueries, so the text[] -> uuid[] cast is written once.
  const accounts = client`select id from auth.users where id = any(${authUserIds}::uuid[])`
  const appUsers = client`select id from public.users where auth_user_fk in (${accounts})`

  await client`update public.region_invitations set accepted_by = null where accepted_by in (${appUsers})`
  // Notifications first: they point at `events` and `reactions`.
  await client`
    delete from public.notifications
    where user_fk in (${appUsers})
       or actor_fk in (${appUsers})
       or subject_fk in (${appUsers})
       or auth_user_fk in (${accounts})`
  await client`delete from public.reactions where user_fk in (${appUsers})`
  await client`delete from public.changes where subject_fk in (${appUsers})`
  await client`delete from public.events where subject_fk in (${appUsers}) or actor_fk in (${appUsers})`
  // Written by the browser, not by the journey, and one row strands the account.
  await client`delete from public.client_error_logs where created_by in (${appUsers})`
  await client`delete from public.push_subscriptions where user_fk in (${appUsers})`
  await client`delete from public.region_members where auth_user_fk in (${accounts})`
  await client`update public.users set user_settings_fk = null where auth_user_fk in (${accounts})`
  await client`delete from public.user_settings where auth_user_fk in (${accounts})`
  await client`delete from public.users where auth_user_fk in (${accounts})`
}
