import { deleteAccountRows } from '$lib/db/testAccounts'
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasDeletionMarker, provisionProfile } from './provision.server'

const alerts = vi.hoisted(() => [] as string[])
vi.mock('$lib/entities/notification/signup.server', () => ({
  notifyAdminsOfSignup: async ({ username }: { username: string }) => {
    alerts.push(username)
  },
}))

const created: string[] = []
async function authUser(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into auth.users (id, email) values (gen_random_uuid(), ${`__provision_${crypto.randomUUID()}@grnyte.test`})
    returning id`
  created.push(row.id)
  return row.id
}
const input = (authUserId: string) => ({
  authUserId,
  contactLocale: 'de',
  gradingScale: 'V' as const,
  origin: 'https://grnyte.test',
  username: 'ada',
})

beforeEach(() => {
  alerts.length = 0
})

afterAll(async () => {
  if (!reachable) return
  await sql`delete from public.auth_events where auth_user_fk = any(${created}::uuid[])`
  await deleteAccountRows(sql, created)
  await sql.end()
})

describe.skipIf(!reachable)('provisionProfile', () => {
  it('creates the profile and its settings with the request locale, and alerts the admins once', async () => {
    const id = await authUser()
    expect(await provisionProfile(input(id))).toEqual({ kind: 'created' })
    expect(await provisionProfile(input(id))).toEqual({ kind: 'exists' })

    const rows = await sql`
      select u.username, s.contact_locale, s.grading_scale, u.user_settings_fk = s.id as linked
      from public.users u join public.user_settings s on s.user_fk = u.id where u.auth_user_fk = ${id}`
    expect(rows).toEqual([{ contact_locale: 'de', grading_scale: 'V', linked: true, username: 'ada' }])
    expect(alerts).toEqual(['ada'])
  })

  it('refuses an account whose profile an account deletion removed', async () => {
    const id = await authUser()
    await sql`insert into public.auth_events (auth_user_fk, kind) values (${id}, 'account_deleted')`

    expect(await hasDeletionMarker(id)).toBe(true)
    expect(await provisionProfile(input(id))).toEqual({ kind: 'deleted' })
    expect(await sql`select 1 from public.users where auth_user_fk = ${id}`).toHaveLength(0)
    expect(alerts).toEqual([])
  })
})
