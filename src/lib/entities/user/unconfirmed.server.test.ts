/**
 * `sweepUnconfirmedAccounts` removes only accounts that are both unconfirmed and past the cutoff, and
 * everything sign-up created for them.
 */
import { deleteAccountRows } from '$lib/db/testAccounts'
import { deleteStaleFixtureAccounts, fixtureRun, reachable, sql } from '$lib/db/testDb'
import { solvedProofOfWork } from '$lib/forms/proofOfWorkFixture'
import { asAnonymousRequest, callForm } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { signUp } from '../../../routes/(landing)/auth/(tabs)/signup/signup.remote'
import { sweepUnconfirmedAccounts, UNCONFIRMED_MAX_AGE_MS } from './unconfirmed.server'

const RUN = fixtureRun()

const EXPIRED = `__unconfirmed_expired_${RUN}__@example.test`
const RECENT = `__unconfirmed_recent_${RUN}__@example.test`
const CONFIRMED = `__unconfirmed_confirmed_${RUN}__@example.test`
const SIGNED_UP = `__unconfirmed_signed_up_${RUN}__@example.test`
const EMAILS = [EXPIRED, RECENT, CONFIRMED, SIGNED_UP]

const deleted: string[] = []
let keptIds: string[] = []
let signedUpId = ''
const nonces: string[] = []

vi.mock('$lib/db/supabaseAdmin.server', () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        // Sign-up's: the id of the aged auth user the round-trip test seeds.
        createUser: async () => ({ data: { user: { id: signedUpId } }, error: null }),
        deleteUser: async (id: string) => {
          deleted.push(id)
          await sql`delete from auth.users where id = ${id}`
          return { error: null }
        },
      },
    },
  }),
}))

async function account(email: string, ageDays: number, confirmed: boolean): Promise<string> {
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
  return id
}

const cleanup = async () => {
  await deleteStaleFixtureAccounts('__unconfirmed_')
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
  keptIds = [await account(RECENT, 6, false), await account(CONFIRMED, 8, true)]
})

afterAll(async () => {
  if (!reachable) return
  await cleanup()
  await sql`delete from public.spent_challenges where nonce = any(${nonces})`
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
    // By id, not by count: the sweep takes every expired account in the database, not only this run's.
    expect(deleted).not.toContain(keptIds[0])
    expect(deleted).not.toContain(keptIds[1])
  })
})

// Sign-up and the sweep are one pair: a row sign-up gains that the sweep misses turns this red.
describe.skipIf(!reachable)('an expired sign-up', () => {
  it('leaves nothing behind once the sweep runs', async () => {
    // Born fresh and aged only before the sweep: the dev stack's own cleanup cron sweeps this database.
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email, created_at) values (gen_random_uuid(), ${SIGNED_UP}, now()) returning id`
    signedUpId = id
    const { encoded, nonce } = await solvedProofOfWork()
    nonces.push(nonce)
    const supabase = { auth: { resend: async () => ({ error: null }) } }
    const { result } = await asAnonymousRequest(supabase, () =>
      callForm<{ result: unknown }>(signUp, {
        altcha: encoded,
        confirmPassword: 'correct-horse',
        email: SIGNED_UP,
        password: 'correct-horse',
        username: 'signedupexpired',
      }),
    )
    expect(result).toEqual({ success: true })

    await sql`update auth.users set created_at = now() - interval '8 days' where id = ${id}`
    await sweepUnconfirmedAccounts(new Date(Date.now() - UNCONFIRMED_MAX_AGE_MS))

    const left = await sql`
      select 1 from auth.users where id = ${id}
      union all select 1 from public.users where auth_user_fk = ${id}
      union all select 1 from public.user_settings where auth_user_fk = ${id}`
    expect(left).toHaveLength(0)
  })
})
