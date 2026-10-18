import { createThrowawayUser, dropThrowawayUser, reachable, seedRegion, sql, type SeedUser } from '$lib/db/testDb'
import { zeroClient } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The notification mutators, including `subscribePush` on the privileged path: the three
// ownership cases `notifications.remote.test.ts` pins, now through Zero's transaction.
const STOLEN = 'https://push.grnyte.test/__notification_mutators_stolen__'
const MOVED = 'https://push.grnyte.test/__notification_mutators_moved__'
const OWN = 'https://push.grnyte.test/__notification_mutators_own__'
const ENDPOINTS = [STOLEN, MOVED, OWN]
const STORED_AUTH = '__notification_mutators_stored_auth__'
const STORED_P256DH = '__notification_mutators_stored_p256dh__'

let owner: SeedUser
let other: SeedUser
let regionId = 0
let client: ReturnType<typeof zeroClient>

beforeAll(async () => {
  if (!reachable) return
  owner = await createThrowawayUser('notification_mutators_owner')
  other = await createThrowawayUser('notification_mutators_other')
  client = zeroClient(other.authId)

  for (const endpoint of [STOLEN, MOVED]) {
    await sql`
      insert into public.push_subscriptions (auth, auth_user_fk, endpoint, p256dh, user_fk)
      values (${STORED_AUTH}, ${owner.authId}, ${endpoint}, ${STORED_P256DH}, ${owner.userId})`
  }
  await sql`
    insert into public.push_subscriptions (auth, auth_user_fk, endpoint, p256dh, user_fk)
    values (${STORED_AUTH}, ${other.authId}, ${OWN}, ${STORED_P256DH}, ${other.userId})`

  // A notification addressed to `other`, for the read mark.
  ;({ regionId } = await seedRegion('__notification_mutators_region__'))
  await sql`
    insert into public.region_members (region_fk, user_fk, auth_user_fk, role, is_active)
    values (${regionId}, ${other.userId}, ${other.authId}, 'region_user', true)`
  await sql`
    insert into public.notifications (region_fk, actor_fk, auth_user_fk, source_type, user_fk)
    values (${regionId}, ${owner.userId}, ${other.authId}, 'mention', ${other.userId})`
})

afterAll(async () => {
  if (!reachable) return
  await client.cleanup()
  await sql`delete from public.push_subscriptions where endpoint = any(${ENDPOINTS})`
  await sql`delete from public.notifications where region_fk = ${regionId}`
  await sql`delete from public.region_members where region_fk = ${regionId}`
  await sql`delete from public.regions where id = ${regionId}`
  const userIds = [owner.userId, other.userId]
  await sql`update public.users set user_settings_fk = null where id = any(${userIds})`
  await sql`delete from public.user_settings where user_fk = any(${userIds})`
  await dropThrowawayUser(owner)
  await dropThrowawayUser(other)
})

async function ownerOf(endpoint: string) {
  const rows = await sql<{ userFk: number }[]>`
    select user_fk as "userFk" from public.push_subscriptions where endpoint = ${endpoint}`
  return rows.at(0)?.userFk
}

const messageOf = (result: { message?: string }) => JSON.parse(result.message ?? '{}').message

describe.skipIf(!reachable)('notification mutators', () => {
  it('refuses an endpoint that belongs to another account', async () => {
    const result = await client.push('notifications.subscribePush', {
      auth: '__notification_mutators_other_auth__',
      endpoint: STOLEN,
      p256dh: '__notification_mutators_other_p256dh__',
    })

    expect(messageOf(result)).toBe('notifications_pushDeviceTaken')
    expect(await ownerOf(STOLEN)).toBe(owner.userId)
  })

  it('lets the same device move to the account now signed in', async () => {
    await client.push('notifications.subscribePush', { auth: STORED_AUTH, endpoint: MOVED, p256dh: STORED_P256DH })

    expect(await ownerOf(MOVED)).toBe(other.userId)
  })

  it('still upserts an endpoint the caller already owns, and forgets it', async () => {
    const rotated = '__notification_mutators_rotated_auth__'
    await client.push('notifications.subscribePush', { auth: rotated, endpoint: OWN, p256dh: STORED_P256DH })

    const [row] = await sql<{ auth: string }[]>`select auth from public.push_subscriptions where endpoint = ${OWN}`
    expect(row.auth).toBe(rotated)

    expect(await client.push('notifications.unsubscribePush', { endpoint: OWN })).toEqual({})
    expect(await ownerOf(OWN)).toBeUndefined()
  })

  it('marks the inbox read and moves the feed watermark forward only', async () => {
    expect(await client.push('notifications.markRead', { userId: other.userId })).toEqual({})
    expect(
      await sql`select 1 from public.notifications where user_fk = ${other.userId} and read_at is null`,
    ).toHaveLength(0)

    const later = Date.UTC(2026, 9, 2)
    await client.push('notifications.markFeedSeen', { seenAt: later })
    await client.push('notifications.markFeedSeen', { seenAt: Date.UTC(2026, 9, 1) })
    const [settings] = await sql<{ seen: Date }[]>`
      select seen_up_to_event_at as seen from public.user_settings where user_fk = ${other.userId}`
    expect(settings.seen.getTime()).toBe(later)
  })
})
