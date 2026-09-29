/**
 * `sweepUnconfirmedAccounts` removes only accounts that are both unconfirmed and past the cutoff.
 */
import { deleteAccountRows } from '$lib/db/testAccounts'
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sweepUnconfirmedAccounts, UNCONFIRMED_MAX_AGE_MS } from './unconfirmed.server'

const EXPIRED = '__unconfirmed_expired__@example.test'
const RECENT = '__unconfirmed_recent__@example.test'
const CONFIRMED = '__unconfirmed_confirmed__@example.test'
const EMAILS = [EXPIRED, RECENT, CONFIRMED]

const deleted: string[] = []

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deleted.push(id)
          await sql`delete from auth.users where id = ${id}`
          return { error: null }
        },
      },
    },
  }),
}))

async function account(email: string, ageDays: number, confirmed: boolean): Promise<void> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into auth.users (id, email, created_at, email_confirmed_at)
    values (gen_random_uuid(), ${email}, now() - make_interval(days => ${ageDays}),
            ${confirmed ? sql`now()` : null})
    returning id`
  const [user] = await sql<{ id: number }[]>`
    insert into public.users (auth_user_fk, username) values (${id}, ${email.slice(2, 20)}) returning id`
  const [settings] = await sql<{ id: number }[]>`
    insert into public.user_settings (auth_user_fk, user_fk) values (${id}, ${user.id}) returning id`
  await sql`update public.users set user_settings_fk = ${settings.id} where id = ${user.id}`
}

const cleanup = async () => {
  const ids = await sql<{ id: string }[]>`select id from auth.users where email = any(${EMAILS})`
  await deleteAccountRows(
    sql,
    ids.map((row) => row.id),
  )
  await sql`delete from auth.users where email = any(${EMAILS})`
}

beforeAll(async () => {
  if (!reachable) return
  await cleanup()
  await account(EXPIRED, 8, false)
  await account(RECENT, 6, false)
  await account(CONFIRMED, 8, true)
})

afterAll(async () => {
  if (reachable) await cleanup()
})

describe.skipIf(!reachable)('sweepUnconfirmedAccounts', () => {
  it('deletes the expired unconfirmed account and its profile, and nothing else', async () => {
    await sweepUnconfirmedAccounts(new Date(Date.now() - UNCONFIRMED_MAX_AGE_MS))

    const left = await sql<{ email: string; profiles: number }[]>`
      select a.email, (select count(*)::int from public.users u where u.auth_user_fk = a.id) as profiles
      from auth.users a where a.email = any(${EMAILS}) order by a.email`
    expect(left).toEqual([
      { email: CONFIRMED, profiles: 1 },
      { email: RECENT, profiles: 1 },
    ])
    expect(deleted).toHaveLength(1)
  })
})
