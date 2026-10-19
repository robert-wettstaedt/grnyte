import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The user mutators, on throwaway accounts: a rename must never touch a shared seed login.
let mara: SeedUser
let jonas: SeedUser
let regionId = 0
let maraClient: ReturnType<typeof zeroClient>
let jonasClient: ReturnType<typeof zeroClient>
const taken = `mara${Date.now() % 100000}`

beforeAll(async () => {
  if (!reachable) return
  ;({ regionId } = await seedRegion('__user_mutators_region__'))
  mara = await createThrowawayUser('user_mutators_mara')
  jonas = await createThrowawayUser('user_mutators_jonas')
  for (const member of [mara, jonas]) {
    await sql`
      insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
      values (${regionId}, ${member.userId}, ${member.authId}, 'region_user', true)`
  }
  await sql`update public.users set username = ${taken} where id = ${mara.userId}`
  maraClient = zeroClient(mara.authId)
  jonasClient = zeroClient(jonas.authId)
})

afterAll(async () => {
  if (!reachable) return
  await maraClient.cleanup()
  await jonasClient.cleanup()
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  const userIds = [mara.userId, jonas.userId]
  await sql`update public.users set user_settings_fk = null where id = any(${userIds})`
  await sql`delete from public.user_settings where user_fk = any(${userIds})`
  await dropThrowawayUser(mara)
  await dropThrowawayUser(jonas)
})

const usernameOf = async (userId: number) =>
  (await sql<{ username: string }[]>`select username from public.users where id = ${userId}`)[0]?.username

describe.skipIf(!reachable)('user mutators', () => {
  it('refuses a name a region mate holds, on the username field', async () => {
    const result = await jonasClient.push('users.updateUsername', { username: taken.toUpperCase() })

    expect(JSON.parse(result.message ?? '{}')).toMatchObject({ message: 'settings_usernameTaken' })
    expect(result.details).toEqual({ field: 'username' })
  })

  it('renames, and tells each region the caller belongs to', async () => {
    const name = `jonas${Date.now() % 100000}`

    expect(await jonasClient.push('users.updateUsername', { username: name })).toEqual({})
    expect(await usernameOf(jonas.userId)).toBe(name)
    expect(
      await sql`select 1 from public.events where region_fk = ${regionId} and actor_fk = ${jonas.userId}`,
    ).toHaveLength(1)
  })

  it('writes one setting, creating the row an account is missing', async () => {
    expect(await maraClient.push('users.updateSettings', { gradingScale: 'V' })).toEqual({})

    const [row] = await sql<{ grading_scale: string }[]>`
      select s.grading_scale from public.user_settings s
      join public.users u on u.user_settings_fk = s.id where u.id = ${mara.userId}`
    expect(row?.grading_scale).toBe('V')
  })
})
