/**
 * Undoing a member's removal is a join like any other: it refuses when the freed seat has since
 * gone to an invitation, rather than putting the region over its cap.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { pushRefusal, zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const REGION = '__member_restore_region__'

let admin: SeedUser
let removed: SeedUser
let client: ReturnType<typeof zeroClient>
let regionId = 0

const remove = () => client.push('regions.removeMember', { regionFk: regionId, userFk: removed.userId })
const restore = () =>
  client.push('regions.restoreMember', { regionFk: regionId, role: 'region_user', userFk: removed.userId })

const isMember = async () =>
  (await sql`select 1 from public.region_members where region_fk = ${regionId} and user_fk = ${removed.userId}`)
    .length === 1

beforeAll(async () => {
  if (!reachable) return
  admin = (await seedUsers({ admin: 'admin@grnyte.rocks' })).admin
  client = zeroClient(admin.authId)
  removed = await createThrowawayUser('member_restore')
  // Two seats: the admin holds one, the member being removed and restored the other.
  const [region] = await sql<{ id: number }[]>`
    insert into public.regions (name, created_by, max_members) values (${REGION}, ${admin.userId}, 2) returning id`
  regionId = region.id
})

beforeEach(async () => {
  if (!reachable) return
  await sql`delete from public.region_invitations where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active) values
      (${regionId}, ${admin.userId}, ${admin.authId}, 'region_admin', true),
      (${regionId}, ${removed.userId}, ${removed.authId}, 'region_user', true)`
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.region_invitations where region_fk = ${regionId}`
  await sql`delete from public.events where region_fk = ${regionId}`
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  await dropThrowawayUser(removed)
})

describe.skipIf(!reachable)('regions.restoreMember', () => {
  it('puts the member back while their seat is still free', async () => {
    expect((await remove()).error).toBeUndefined()
    expect(await restore()).toEqual({})
    expect(await isMember()).toBe(true)
  })

  it('refuses once an invitation has taken the freed seat', async () => {
    expect((await remove()).error).toBeUndefined()
    await sql`
      insert into public.region_invitations (region_fk, email, invited_by, token, status, expires_at)
      values (${regionId}, '__member_restore_invitee__@grnyte.test', ${admin.userId}, gen_random_uuid(),
        'pending', now() + interval '7 days')`

    expect(pushRefusal(await restore()).message).toBe('region_seatsFull')
    expect(await isMember()).toBe(false)
  })
})
