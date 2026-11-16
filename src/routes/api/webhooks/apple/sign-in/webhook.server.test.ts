// @vitest-environment node
/** Apple's account notifications at the endpoint, against a real database and a key set the test serves. */
import { PROVIDER_ENV, publicJwk, signIdToken, signWithIssuerKey } from '$lib/auth/oauth/issuer.fixture'
import { createLocalJWKSet, generateKeyPair, SignJWT } from 'jose'
import type { TransactionSql } from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The Services ID of `PROVIDER_ENV`, written out: `vi.mock` is hoisted above the imports.
// fallow-ignore-next-line code-duplication -- vi.mock is hoisted per file: each test that sets provider variables declares its own
vi.mock('$env/dynamic/private', async (actual) => ({
  env: { ...(await actual<{ env: Record<string, string> }>()).env, APPLE_SERVICES_ID: 'rocks.grnyte.web' },
}))

/** What reached the mail host: the network edge, as `send.server.test.ts` stubs it. */
const mailed = vi.hoisted((): { subject: string; to: string }[] => [])
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (mail: { subject: string; to: string | string[] }) => {
        mailed.push({ subject: mail.subject, to: [mail.to].flat().join(',') })
        return { data: { id: 'sent' }, error: null }
      },
    }
  },
}))

const { reachable, sql } = await import('$lib/db/testDb')
const { appleKeys } = await import('$lib/auth/app/appleToken.server')
const { crossSiteGuard } = await import('$lib/hooks/crossSite.server')
const { asRequest, newSession, statusOf } = await import('$lib/remote/testHarness')
const { mailForwardingQuery, signInMethodsQuery } = await import('$lib/auth/methods/identities.remote')
const { POST } = await import('./+server')

const URL_PATH = 'https://grnyte.rocks/api/webhooks/apple/sign-in'
const started = new Date()
const run = crypto.randomUUID().slice(0, 8)
const accounts: string[] = []

/** An identity as GoTrue writes it, `created_at` included: the column has no default. */
const insertIdentity = (tx: TransactionSql, userId: string, provider: string, providerId: string, data: object) =>
  tx`insert into auth.identities (user_id, provider, provider_id, identity_data, created_at)
    values (${userId}, ${provider}, ${providerId}, ${tx.json(data as never)}, now())`

/** A confirmed account whose Apple identity has `sub`, with the address Apple made for it unless `email` is given. */
async function appleAccount({ email = '', password = null as null | string } = {}) {
  const sub = `apple-${run}-${accounts.length}`
  const address = email || `${sub}@privaterelay.appleid.com`
  const userId = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at, encrypted_password)
      values (gen_random_uuid(), ${address}, now(), ${password}) returning id`
    await tx`select set_config('grnyte.auth_user_created', ${user.id}, true)`
    await insertIdentity(tx, user.id, 'apple', sub, { email: address, is_private_email: !email })
    // A password writes GoTrue's email identity too (gotrue.contract).
    if (password != null) {
      await insertIdentity(tx, user.id, 'email', user.id, { email: address })
    }
    return user.id
  })
  accounts.push(userId)
  return { address, sub, userId }
}

/** The account's Apple notification outcomes, oldest first. */
const outcomes = async (userId: string) =>
  (
    await sql<{ detail: Record<string, string> }[]>`
      select detail from public.auth_events where auth_user_fk = ${userId} and kind = 'apple_notification'
      order by id`
  ).map(({ detail }) => `${detail.type}:${detail.outcome}`)

const banner = async (userId: string) => (await asRequest(userId, () => mailForwardingQuery())).address

/** The stored forwarding state's time, in epoch seconds. */
const eventAt = async (userId: string) =>
  (
    await sql<{ at: number }[]>`
      select extract(epoch from event_at)::float as at from public.apple_mail_forwarding where auth_user_fk = ${userId}`
  )[0]?.at

const seconds = (date = new Date()) => Math.floor(date.getTime() / 1000)

/** Whether `sessionId` still works: a remote answers, or refuses it as signed out (401). */
const signedIn = async (userId: string, sessionId: string) =>
  (await statusOf(() =>
    asRequest(userId, () => signInMethodsQuery(), { auth: { signOut: async () => ({ error: null }) } }, { sessionId }),
  )) !== 401

const appleLinked = async (userId: string) =>
  (await asRequest(userId, () => signInMethodsQuery())).providers.apple.linked

// A second ahead by default, as the account was made within this one. Seconds here; Apple sends milliseconds.
const revocation = (account: { sub: string }, type: 'account-deleted' | 'consent-revoked', at = seconds() + 1) =>
  notification({ event_time: at, sub: account.sub, type })

/** Moves the account's Apple identity and sessions two minutes into the past, before an event at `now - 60`. */
const backdate = (userId: string) =>
  sql.begin(async (tx) => {
    await tx`update auth.identities set created_at = now() - interval '2 minutes', last_sign_in_at = null
      where user_id = ${userId}`
    await tx`update auth.sessions set created_at = now() - interval '2 minutes' where user_id = ${userId}`
  })

const post = (payload: string) =>
  POST({
    request: new Request(URL_PATH, {
      body: JSON.stringify({ payload }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  } as never)

/** Apple notification events recorded since this file started, of any account. */
const recorded = async () =>
  (
    await sql<{ n: number }[]>`
      select count(*)::int as n from public.auth_events
      where kind like 'apple_notification%' and created_at >= ${started}`
  )[0].n

/** A notification JWS as Apple signs one; `events` as the JSON string Apple's implementations report. */
const notification = (events: Record<string, unknown>, claims: Record<string, unknown> = {}) =>
  signWithIssuerKey({
    aud: PROVIDER_ENV.APPLE_SERVICES_ID,
    events: JSON.stringify(events),
    iat: Math.floor(Date.now() / 1000),
    iss: 'https://appleid.apple.com',
    jti: crypto.randomUUID(),
    ...claims,
  })

beforeEach(() => {
  appleKeys.source = createLocalJWKSet({ keys: [publicJwk] })
})

afterAll(async () => {
  if (reachable) await sql`delete from auth.users where id = any(${accounts})`
  await sql.end()
})

describe.skipIf(!reachable)('POST /api/webhooks/apple/sign-in', () => {
  it('refuses a token Apple did not sign and records nothing', async () => {
    const { privateKey } = await generateKeyPair('RS256')
    const forged = await new SignJWT({ events: JSON.stringify({ sub: 'x', type: 'consent-revoked' }) })
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
      .setIssuer('https://appleid.apple.com')
      .setAudience(PROVIDER_ENV.APPLE_SERVICES_ID)
      .setIssuedAt()
      .sign(privateKey)
    const before = await recorded()

    expect((await post(forged)).status).toBe(400)
    expect(await recorded()).toBe(before)
  })

  it("marks the account's address as receiving no mail when Apple turns forwarding off", async () => {
    const { address, sub, userId } = await appleAccount()
    expect(await banner(userId)).toBeNull()

    const disabled = await notification({
      email: address,
      event_time: seconds(),
      is_private_email: 'true',
      sub,
      type: 'email-disabled',
    })
    expect((await post(disabled)).status).toBe(200)

    expect(await banner(userId)).toBe(address)
    expect(await outcomes(userId)).toEqual(['email-disabled:applied'])
  })

  /** Apple's forwarding notification for this account at `at` (seconds, or milliseconds as Apple sends it). */
  const forwarding = (
    account: { address: string; sub: string },
    type: 'email-disabled' | 'email-enabled',
    at: number,
  ) => notification({ email: account.address, event_time: at, is_private_email: 'true', sub: account.sub, type })

  // Apple's live `email-disabled` (2026-11-16) carried `event_time` 1794861507552: milliseconds.
  it.each([
    ['seconds', 1],
    ['milliseconds, as Apple sends it', 1000],
  ])('marks, then clears the mark when Apple turns forwarding back on, with event_time in %s', async (_unit, scale) => {
    const account = await appleAccount()
    const now = seconds()
    expect((await post(await forwarding(account, 'email-disabled', (now - 60) * scale))).status).toBe(200)
    expect(await banner(account.userId)).toBe(account.address)
    expect((await post(await forwarding(account, 'email-enabled', now * scale))).status).toBe(200)

    // Stored in seconds whatever the unit: an unconverted millisecond value lands in the year 58,000.
    expect(Math.abs((await eventAt(account.userId))! - now)).toBeLessThan(5)
    expect(await banner(account.userId)).toBeNull()
    expect(await outcomes(account.userId)).toEqual(['email-disabled:applied', 'email-enabled:applied'])
  })

  it('keeps the later state when the two arrive in reverse order', async () => {
    const account = await appleAccount()
    const now = seconds()
    await post(await forwarding(account, 'email-enabled', now))
    await post(await forwarding(account, 'email-disabled', now - 60))

    expect(await banner(account.userId)).toBeNull()
    expect(await outcomes(account.userId)).toEqual(['email-enabled:applied', 'email-disabled:stale'])
  })

  it('shows nothing once the account uses another address', async () => {
    const account = await appleAccount()
    await sql`update auth.users set email = ${`moved-${run}@example.org`} where id = ${account.userId}`
    expect((await post(await forwarding(account, 'email-disabled', seconds()))).status).toBe(200)

    expect(await banner(account.userId)).toBeNull()
  })

  it('never marks a real address someone shared with Apple', async () => {
    const shared = await appleAccount({ email: `ana-${run}@gmail.com` })
    const disabled = await notification({
      email: shared.address,
      event_time: seconds(),
      is_private_email: 'false',
      sub: shared.sub,
      type: 'email-disabled',
    })
    expect((await post(disabled)).status).toBe(200)

    expect(await banner(shared.userId)).toBeNull()
    expect(await outcomes(shared.userId)).toEqual(['email-disabled:ignored'])
  })

  it('finds by its address an account that removed Apple but kept the address', async () => {
    const account = await appleAccount({ password: '$2a$10$hash' })
    await sql.begin(async (tx) => {
      await tx`select set_config('grnyte.apple_identity_removal', ${`${account.userId}:${account.sub}`}, true)`
      await tx`delete from auth.identities where user_id = ${account.userId} and provider = 'apple'`
    })
    expect((await post(await forwarding(account, 'email-disabled', seconds()))).status).toBe(200)

    expect(await banner(account.userId)).toBe(account.address)
  })

  it('records an Apple user no account has, and a type it does not know, without an account', async () => {
    const unmatched = async (outcome: string) =>
      (
        await sql<{ n: number }[]>`
          select count(*)::int as n from public.auth_events
          where kind = 'apple_notification' and auth_user_fk is null and created_at >= ${started}
            and detail->>'outcome' = ${outcome}`
      )[0].n
    const before = { ignored: await unmatched('ignored'), noAccount: await unmatched('no_account') }
    const nobody = { address: `nobody-${run}@privaterelay.appleid.com`, sub: `nobody-${run}` }

    expect((await post(await forwarding(nobody, 'email-disabled', seconds()))).status).toBe(200)
    expect((await post(await notification({ event_time: seconds(), sub: nobody.sub, type: 'brand-new' }))).status).toBe(
      200,
    )

    expect(await unmatched('no_account')).toBe(before.noAccount + 1)
    expect(await unmatched('ignored')).toBe(before.ignored + 1)
  })

  describe('what gets recorded', () => {
    const invalid = async () =>
      (
        await sql<{ n: number }[]>`
          select count(*)::int as n from public.auth_events
          where kind = 'apple_notification_invalid' and created_at >= ${started}`
      )[0].n
    const event = (overrides: Record<string, unknown> = {}) => ({
      email: `x-${run}@privaterelay.appleid.com`,
      event_time: seconds(),
      is_private_email: 'true',
      sub: `x-${run}`,
      type: 'email-disabled',
      ...overrides,
    })

    it('records a notification for grnyte issued more than a day ago', async () => {
      const before = await invalid()
      const dayAgo = seconds() - 2 * 24 * 60 * 60
      expect((await post(await notification(event({ event_time: dayAgo }), { iat: dayAgo }))).status).toBe(400)
      expect(await invalid()).toBe(before + 1)
    })

    // A fresh token, so the age check passes and the `event_time` window is what refuses.
    it('refuses an event_time outside the issue window, in seconds or in milliseconds', async () => {
      const before = await invalid()
      const now = seconds()
      for (const at of [now - 2 * 24 * 60 * 60, now + 10 * 60]) {
        for (const scale of [1, 1000]) {
          expect((await post(await notification(event({ event_time: at * scale })))).status).toBe(400)
        }
      }
      const reasons = await sql<{ reason: string }[]>`
        select detail->>'reason' as reason from public.auth_events
        where kind = 'apple_notification_invalid' and created_at >= ${started} order by id desc limit 4`
      expect(await invalid()).toBe(before + 4)
      expect(reasons.map(({ reason }) => reason)).toEqual(['events', 'events', 'events', 'events'])
    })

    it("records nothing for another app's notification, a sign-in token, or a token signed with HS256 or none", async () => {
      const before = { invalid: await invalid(), recorded: await recorded() }
      const idToken = await signIdToken('apple', { aud: PROVIDER_ENV.APPLE_SERVICES_ID, sub: `x-${run}` })
      const hs256 = await new SignJWT({ events: JSON.stringify(event()) })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://appleid.apple.com')
        .setAudience(PROVIDER_ENV.APPLE_SERVICES_ID)
        .setIssuedAt()
        .sign(new TextEncoder().encode('a-secret-at-least-32-characters-long!!'))
      const none = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ events: event(), iat: seconds() }))}.`

      for (const token of [await notification(event(), { aud: 'com.other.app' }), idToken, idToken, hs256, none]) {
        expect((await post(token)).status).toBe(400)
      }
      expect({ invalid: await invalid(), recorded: await recorded() }).toEqual(before)
    })

    it("answers 503 while Apple's keys are unreachable", async () => {
      appleKeys.source = async () => {
        throw new Error('key set down')
      }
      expect((await post(await notification(event()))).status).toBe(503)
    })
  })

  it('removes Apple when the person stops using it and has a password, signs every device out, and mails a notice', async () => {
    const account = await appleAccount({ password: '$2a$10$hash' })
    const device = await newSession(account.userId)
    mailed.length = 0

    expect((await post(await revocation(account, 'consent-revoked'))).status).toBe(200)

    expect(await appleLinked(account.userId)).toBe(false)
    const [{ email }] = await sql<{ email: string }[]>`select email from auth.users where id = ${account.userId}`
    expect(email).toBe(account.address)
    expect(await signedIn(account.userId, device)).toBe(false)
    expect(mailed).toEqual([{ subject: 'Apple was removed from your grnyte account', to: account.address }])
    expect(await outcomes(account.userId)).toEqual(['consent-revoked:removed'])
  })

  it.each(['consent-revoked', 'account-deleted'] as const)(
    'keeps Apple, the account and its content when Apple is the only way in, and signs every device out (%s)',
    async (type) => {
      const account = await appleAccount()
      const device = await newSession(account.userId)

      expect((await post(await revocation(account, type))).status).toBe(200)

      expect(await appleLinked(account.userId)).toBe(true)
      expect(await signedIn(account.userId, device)).toBe(false)
      expect(await outcomes(account.userId)).toEqual([`${type}:kept_only_method`])
    },
  )

  describe('a late or repeated revocation', () => {
    /** Writes past the identity trigger as GoTrue's own sign-in would, for setting a scene. */
    const asGoTrue = (userId: string, write: (tx: TransactionSql) => Promise<unknown>) =>
      sql.begin(async (tx) => {
        await tx`select set_config('grnyte.auth_user_created', ${userId}, true)`
        await write(tx)
      })

    it.each([
      {
        case: 'the person added Apple again',
        comesBack: (tx: TransactionSql, a: Awaited<ReturnType<typeof appleAccount>>) =>
          insertIdentity(tx, a.userId, 'apple', a.sub, { email: a.address }),
        first: 'removed',
        password: '$2a$10$hash' as null | string,
      },
      {
        case: 'an Apple-only person signed in with Apple again and set a password',
        comesBack: async (tx: TransactionSql, a: Awaited<ReturnType<typeof appleAccount>>) => {
          await tx`update auth.identities set last_sign_in_at = now() where user_id = ${a.userId}`
          await tx`update auth.users set encrypted_password = '$2a$10$hash' where id = ${a.userId}`
          await insertIdentity(tx, a.userId, 'email', a.userId, { email: a.address })
        },
        first: 'kept_only_method',
        password: null,
      },
    ])('leaves Apple and the new device once $case after the event', async ({ comesBack, first, password }) => {
      const account = await appleAccount({ password })
      await backdate(account.userId)
      const event = await revocation(account, 'consent-revoked', seconds() - 60)
      await post(event)
      await asGoTrue(account.userId, (tx) => comesBack(tx, account))
      const device = await newSession(account.userId)

      await post(event)

      expect(await appleLinked(account.userId)).toBe(true)
      expect(await signedIn(account.userId, device)).toBe(true)
      expect(await outcomes(account.userId)).toEqual([`consent-revoked:${first}`, 'consent-revoked:stale'])
    })

    it.each([
      ['seconds', 1],
      ['milliseconds, as Apple sends it', 1000],
    ])('never signs out a device that signed in after the event, with event_time in %s', async (_unit, scale) => {
      const account = await appleAccount()
      const before = await newSession(account.userId)
      await backdate(account.userId)
      const after = await newSession(account.userId)

      await post(await revocation(account, 'consent-revoked', (seconds() - 60) * scale))

      expect(await signedIn(account.userId, before)).toBe(false)
      expect(await signedIn(account.userId, after)).toBe(true)
    })
  })

  describe('a deleted Apple ID', () => {
    it('removes Apple and marks the private address as receiving no mail', async () => {
      const account = await appleAccount({ password: '$2a$10$hash' })

      expect((await post(await revocation(account, 'account-deleted'))).status).toBe(200)

      expect(await appleLinked(account.userId)).toBe(false)
      expect(await banner(account.userId)).toBe(account.address)
      expect(await outcomes(account.userId)).toEqual(['account-deleted:removed'])
    })

    it('marks nothing for a real address someone shared with Apple', async () => {
      const account = await appleAccount({ email: `bea-${run}@gmail.com`, password: '$2a$10$hash' })

      await post(await revocation(account, 'account-deleted'))

      expect(await banner(account.userId)).toBeNull()
    })
  })

  describe('beside a removal GoTrue makes at the same moment', () => {
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const grantUnlink = (userId: string, provider: string) =>
      sql`insert into public.reauth_grants (auth_user_fk, session_id, action, target, method, expires_at)
        values (${userId}, gen_random_uuid(), 'identity.unlink', ${provider}, 'email_code', now() + interval '5 minutes')`

    /** The handler answered, Apple is still linked, and it recorded `outcome`. */
    async function expectAppleKept(answer: Response, userId: string, outcome: string) {
      expect(answer.status).toBe(200)
      expect(await appleLinked(userId)).toBe(true)
      expect(await outcomes(userId)).toEqual([`consent-revoked:${outcome}`])
    }

    /** Posts `event` while GoTrue's transaction (`work`) holds its locks, then lets GoTrue commit; the answer. */
    async function postWhileGoTrueHolds(event: string, work: (tx: TransactionSql) => Promise<unknown>) {
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      let held!: () => void
      const holding = new Promise<void>((resolve) => (held = resolve))
      const gotrue = sql.begin(async (tx) => {
        await work(tx)
        held()
        await gate
      })
      await holding
      const answer = post(event)
      // Long enough for the handler to reach the lock GoTrue holds.
      await pause(300)
      release()
      await gotrue
      return answer
    }

    it('treats as stale a revocation whose account signed in with Apple while it waited for the lock', async () => {
      const account = await appleAccount({ password: '$2a$10$hash' })
      await backdate(account.userId)
      const event = await revocation(account, 'consent-revoked', seconds() - 60)

      // GoTrue's sign-in with Apple: it holds the account row while it records the sign-in, then commits.
      const answer = await postWhileGoTrueHolds(event, async (tx) => {
        await tx`select 1 from auth.users where id = ${account.userId} for update`
        await tx`update auth.identities set last_sign_in_at = now() where user_id = ${account.userId} and provider = 'apple'`
      })

      await expectAppleKept(answer, account.userId, 'stale')
    })

    it('keeps a way in when the person removes Google while Apple says it was stopped', async () => {
      const account = await appleAccount()
      await sql.begin(async (tx) => {
        await tx`select set_config('grnyte.auth_user_created', ${account.userId}, true)`
        await insertIdentity(tx, account.userId, 'google', `g-${account.sub}`, { email: account.address })
      })
      await grantUnlink(account.userId, 'google')
      const event = await revocation(account, 'consent-revoked')

      // GoTrue's unlink of Google: it passes the floor (Apple remains) and holds the account's lock until it commits.
      const answer = await postWhileGoTrueHolds(
        event,
        (tx) => tx`delete from auth.identities where user_id = ${account.userId} and provider = 'google'`,
      )

      await expectAppleKept(answer, account.userId, 'kept_only_method')
    })

    it('retries once when it loses a deadlock to GoTrue removing the same Apple, then finds it gone', async () => {
      const account = await appleAccount({ password: '$2a$10$hash' })
      await grantUnlink(account.userId, 'apple')
      const event = await revocation(account, 'consent-revoked')

      let held!: () => void
      const holding = new Promise<void>((resolve) => (held = resolve))
      // GoTrue holds the Apple row, then wants the account row the handler holds by then. Its long deadlock_timeout
      // makes the handler the side that detects the cycle, and so the side Postgres aborts.
      const gotrue = sql.begin(async (tx) => {
        await tx`set local deadlock_timeout = '10s'`
        await tx`select 1 from auth.identities where user_id = ${account.userId} and provider = 'apple' for update`
        held()
        await pause(300)
        await tx`delete from auth.identities where user_id = ${account.userId} and provider = 'apple'`
      })
      await holding
      const answer = post(event)
      await gotrue

      expect((await answer).status).toBe(200)
      expect(await appleLinked(account.userId)).toBe(false)
      // The retry matched no account any more, so its `no_account` is logged without one.
      expect(await outcomes(account.userId)).toEqual([])
    })
  })

  it('is not refused as cross-site: Apple posts with no cookie and no Sec-Fetch-Site', async () => {
    const resolve = vi.fn(async () => new Response(null, { status: 200 }))
    const request = new Request(URL_PATH, { body: '{}', method: 'POST' })
    const response = await crossSiteGuard({ event: { request } as never, resolve } as never)
    expect(resolve).toHaveBeenCalled()
    expect(response.status).toBe(200)
  })
})
