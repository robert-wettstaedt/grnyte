/**
 * `subscribeToPush` drives the real handler, in a real RLS transaction, as a real account.
 *
 * The case that matters: the privileged pre-delete demands endpoint + auth + p256dh, which is proof
 * the caller IS that device, and the `ON CONFLICT (endpoint) DO UPDATE` right after it demands
 * nothing at all. An endpoint is a string a request can simply state, so a caller stating somebody
 * else's endpoint has the upsert rewrite `user_fk` to them: the real owner stops receiving their
 * pushes, and their browser starts receiving payloads it cannot decrypt.
 *
 * Three cases, because the fix has an ordering that is easy to get backwards:
 *  - a stated endpoint the caller cannot prove possession of must be refused (the hole),
 *  - the same endpoint WITH the stored keys must still move accounts (the re-subscribe the
 *    pre-delete exists for, which an ownership check placed before that delete would 403),
 *  - and an endpoint the caller already owns must keep upserting (a check that refuses any
 *    pre-existing row would break every second subscribe from the same device).
 *
 * Throwaway accounts rather than seed logins: this asserts on row OWNERSHIP, and the seed logins
 * are shared with suites vitest runs in parallel.
 *
 * Skipped when DATABASE_URL is unreachable, like every other DB-backed suite here.
 */
import { createThrowawayUser, dropThrowawayUser, reachable, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest } from '$lib/remote/testHarness'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { subscribeToPush } from './notifications.remote'

/** One endpoint per case, so no test depends on what another one left behind. */
const STOLEN = 'https://push.grnyte.test/__notifications_remote_stolen__'
const MOVED = 'https://push.grnyte.test/__notifications_remote_moved__'
const OWN = 'https://push.grnyte.test/__notifications_remote_own__'
const ENDPOINTS = [STOLEN, MOVED, OWN]

/** The keys the stored rows carry. `auth` is the browser's own secret, so presenting it is what
 *  separates "this device came back" from "a caller named this device". */
const STORED_AUTH = '__notifications_remote_stored_auth__'
const STORED_P256DH = '__notifications_remote_stored_p256dh__'

let owner: SeedUser
let other: SeedUser

beforeAll(async () => {
  if (!reachable) return

  owner = await createThrowawayUser('push_owner')
  other = await createThrowawayUser('push_other')

  // Two devices registered to `owner`, and one already registered to `other`.
  for (const endpoint of [STOLEN, MOVED]) {
    await sql`
      insert into public.push_subscriptions (auth, auth_user_fk, endpoint, p256dh, user_fk)
      values (${STORED_AUTH}, ${owner.authId}, ${endpoint}, ${STORED_P256DH}, ${owner.userId})`
  }

  await sql`
    insert into public.push_subscriptions (auth, auth_user_fk, endpoint, p256dh, user_fk)
    values (${STORED_AUTH}, ${other.authId}, ${OWN}, ${STORED_P256DH}, ${other.userId})`
})

afterAll(async () => {
  if (reachable) {
    await sql`delete from public.push_subscriptions where endpoint = any(${ENDPOINTS})`

    // `subscribeToPush` initialises the watermarks on a FIRST subscription, and `users` points at
    // the settings row that write creates, so the link is dropped before the row it points to or
    // the delete below raises 23503.
    const userIds = [owner.userId, other.userId]
    await sql`update public.users set user_settings_fk = null where id = any(${userIds})`
    await sql`delete from public.user_settings where user_fk = any(${userIds})`

    await dropThrowawayUser(owner)
    await dropThrowawayUser(other)
  }
  await sql.end()
})

/** Who owns `endpoint` right now. Read on the superuser handle, so a row RLS would hide from the
 *  caller cannot make a takeover look like an absent row. */
async function ownerOf(endpoint: string): Promise<number | undefined> {
  const rows = await sql<{ userFk: number }[]>`
    select user_fk as "userFk" from public.push_subscriptions where endpoint = ${endpoint}`
  return rows.at(0)?.userFk
}

describe.skipIf(!reachable)('subscribeToPush', () => {
  it('refuses an endpoint that belongs to another account', async () => {
    const call = asRequest(other.authId, () =>
      subscribeToPush({
        // The caller's OWN keys. They cannot present the stored pair, which is exactly what makes
        // this a stated name rather than a device coming back, and what the pre-delete above
        // therefore leaves alone.
        auth: '__notifications_remote_other_auth__',
        endpoint: STOLEN,
        p256dh: '__notifications_remote_other_p256dh__',
      }),
    )

    await expect(call).rejects.toMatchObject({ status: 403 })
    expect(await ownerOf(STOLEN)).toBe(owner.userId)
  })

  it('lets the same device move to the account now signed in', async () => {
    // Endpoint AND the stored keys: the pre-delete removes the previous owner's row first, so the
    // ownership check finds nothing to refuse. This is the assertion that pins the ordering, since
    // moving the check above the pre-delete makes this legitimate re-subscribe 403.
    await asRequest(other.authId, () => subscribeToPush({ auth: STORED_AUTH, endpoint: MOVED, p256dh: STORED_P256DH }))

    expect(await ownerOf(MOVED)).toBe(other.userId)
  })

  it('still upserts an endpoint the caller already owns', async () => {
    // A key rotation on the caller's own device. The endpoint has an owner, so a check that
    // refused any pre-existing row would break this, which is why it compares the owner.
    await asRequest(other.authId, () =>
      subscribeToPush({
        auth: '__notifications_remote_rotated_auth__',
        endpoint: OWN,
        p256dh: '__notifications_remote_rotated_p256dh__',
      }),
    )

    const [row] = await sql<{ auth: string; userFk: number }[]>`
      select auth, user_fk as "userFk" from public.push_subscriptions where endpoint = ${OWN}`
    expect(row.userFk).toBe(other.userId)
    expect(row.auth).toBe('__notifications_remote_rotated_auth__')
  })
})
