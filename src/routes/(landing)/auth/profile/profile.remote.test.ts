import { deleteAccountRows } from '$lib/db/testAccounts'
import { reachable, sql } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { completeProfile } from './profile.remote'

vi.mock('$lib/entities/notification/signup.server', () => ({ notifyAdminsOfSignup: async () => {} }))

const created: string[] = []

afterAll(async () => {
  if (!reachable) return
  await deleteAccountRows(sql, created)
  await sql.end()
})

describe.skipIf(!reachable)('completeProfile', () => {
  it('creates the profile and lands a foreign next on the app home', async () => {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email) values (gen_random_uuid(), ${`__profile_${crypto.randomUUID()}@grnyte.test`})
      returning id`
    created.push(id)

    const answer = await asRequest(id, () =>
      completeProfile({ gradingScale: 'FB', next: 'https://evil.example/invite', username: 'ada' }),
    )

    expect(answer).toEqual({ redirectTo: '/explore' })
    expect(await sql`select 1 from public.users where auth_user_fk = ${id}`).toHaveLength(1)
  })
})
