import type { VerifiedToken } from '$lib/auth'
import { cookieJar } from '$lib/auth/oauth/cookieJar.fixture'
import {
  confirmedAccount as confirmedAccountIn,
  cookieClient,
  fakeGoTrue,
  locationOf,
  ORIGIN,
  SECRET,
  SUPABASE,
  type Account,
  type GoTrueCall,
} from '$lib/auth/oauth/goTrue.fixture'
import { fakeIssuer, PROVIDER_ENV, RAW_NONCE, RAW_NONCE_DIGEST, signIdToken } from '$lib/auth/oauth/issuer.fixture'
import { reachable, sql } from '$lib/db/testDb'
import { createServerClient } from '@supabase/ssr'
import type { RequestEvent } from '@sveltejs/kit'
import { with_request_store } from '@sveltejs/kit/internal/server'
import { decodeJwt } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted((): Record<string, string> => ({
  SUPABASE_JWT_SECRET: 'tracer-jwt-secret-at-least-32-characters',
}))
vi.mock('$env/dynamic/private', () => ({ env }))
// Repeated runs pile up mismatch events past the spike threshold; no admin mail from a test.
vi.mock('$lib/entities/notification/adminAlert.server', () => ({ alertAppAdmins: vi.fn() }))
vi.mock('$env/static/public', async (actual) => ({
  ...(await actual()),
  ...(await import('$lib/auth/oauth/testEnv.fixture')).PUBLIC_ENV,
}))
vi.mock('$env/static/private', async (actual) => ({ ...(await actual()), SUPABASE_SECRET_KEY: 'sb_secret_test' }))
const nonce = vi.hoisted(() => ({ fixed: undefined as string | undefined }))
vi.mock('openid-client', async (actual) =>
  (await import('$lib/auth/oauth/testEnv.fixture')).withFixedNonce(await actual(), nonce),
)

const { match } = await import('../../../../params/oauthProvider')
const { POST: start } = await import('../oauth/[provider=oauthProvider]/+server')
const { GET: googleCallback } = await import('./google/+server')
const { GET: appleCallback, POST: applePost } = await import('./apple/+server')
const { dispatchIntent } = await import('$lib/auth/oauth/flow.server')
const { supabaseAuthServer } = await import('$lib/auth/authServer.server')
const { verifyAccessToken } = await import('$lib/auth/verify.server')
const { spendGrant, writeGrant } = await import('$lib/auth/reauth.server')
const { pinnedTx } = await import('$lib/db/pinned.server')

let gotrue: GoTrueCall[] = []
/** GoTrue refuses the user lookup `setSession` makes, so no cookie session can be written. */
let refuseUser = false
/** GoTrue answers the ID-token link with this status instead of linking. */
let refuseLink: number | undefined
const LAST_METHOD = 'grnyte-last-method'
let issuer: ReturnType<typeof fakeIssuer>
/** The account GoTrue answers every call with; a refresh answers it without the contested flag. */
let account: Account

beforeEach(() => {
  gotrue = []
  refuseUser = false
  refuseLink = undefined
  issuer = fakeIssuer()
  nonce.fixed = undefined
  account = { app_metadata: {}, id: crypto.randomUUID() }
  Object.assign(env, PROVIDER_ENV)
  fakeGoTrue(
    gotrue,
    () => account,
    (next) => (account = next),
    () => refuseUser,
    () => refuseLink,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

type Browser = ReturnType<typeof browser>

function browser(origin = ORIGIN, signedIn?: VerifiedToken) {
  const jar = cookieJar()
  const as = { token: signedIn }
  const event = (method: string, path: string, form?: Record<string, string>): never => {
    const url = new URL(path, origin)
    const body = form == null ? undefined : new URLSearchParams(form)
    const supabase = cookieClient(jar)
    return {
      cookies: jar.cookies,
      getClientAddress: () => '198.51.100.7',
      isRemoteRequest: false,
      locals: {
        backendUnavailable: false,
        claims: as.token?.claims,
        safeGetSession: async () => ({ claims: as.token?.claims, verifiedToken: as.token }),
        supabase,
      },
      params: { provider: path.split('/')[3] },
      request: new Request(url, { body, method }),
      url,
    } as unknown as RequestEvent as never
  }
  return { as, event, jar }
}

async function signIn(
  b: Browser,
  provider: 'apple' | 'google',
  { answer = {}, form = {} }: { answer?: Record<string, string>; form?: Record<string, string> } = {},
) {
  const authorizeUrl = new URL(
    await locationOf(() => start(b.event('POST', `/auth/oauth/${provider}`, { intent: 'signin', ...form }) as never)),
  )
  issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
  const query = new URLSearchParams({ code: 'code-1', state: authorizeUrl.searchParams.get('state') ?? '', ...answer })
  const callback = provider === 'google' ? googleCallback : appleCallback
  const landed = await locationOf(() => callback(b.event('GET', `/auth/callback/${provider}?${query}`) as never))
  return { authorizeUrl, landed }
}

const uniqueEmail = (label: string) => `__oauth_${label}_${crypto.randomUUID().slice(0, 8)}@example.test`
const eventCount = async (kind: string) =>
  (await sql<{ n: number }[]>`select count(*)::int as n from public.auth_events where kind = ${kind}`)[0].n

const reasonOf = (landed: string) => new URL(landed, ORIGIN).searchParams.get('reason')

async function cookieAccessToken(b: Browser) {
  const after = createServerClient(SUPABASE, 'sb_publishable_test', {
    cookies: { getAll: () => b.jar.cookies.getAll(), setAll: () => {} },
  })
  return (await after.auth.getSession()).data.session?.access_token
}

/** Landed on the error page with `reason`, and a `kind` event recorded (more, not exactly one more:
 *  other files record the same account-less kinds in parallel). */
async function expectRecorded(landed: string, reason: string, kind: string, before: number, provider?: string) {
  expect(reasonOf(landed)).toBe(reason)
  expect(new URL(landed, ORIGIN).searchParams.get('provider')).toBe(provider ?? null)
  expect(await eventCount(kind)).toBeGreaterThan(before)
}

describe('the provider route parameter', () => {
  it('matches apple and google only', () => {
    expect(['apple', 'google', 'facebook', 'github'].filter((name) => match(name))).toEqual(['apple', 'google'])
  })
})

describe('starting a sign-in', () => {
  it('sends the nonce digest, never the raw value, and PKCE S256 to Google on redirectUri', async () => {
    nonce.fixed = RAW_NONCE
    const url = new URL(
      await locationOf(() => start(browser().event('POST', '/auth/oauth/google', { intent: 'signin' }))),
    )

    expect(url.searchParams.get('nonce')).toBe(RAW_NONCE_DIGEST)
    expect(url.href).not.toContain(RAW_NONCE)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback/google`)
  })

  it('sends a signed-in caller on through /auth/continue, starting nothing', async () => {
    const b = browser(ORIGIN, { claims: { sub: 'sub-1' } } as never)

    expect(
      await locationOf(() => start(b.event('POST', '/auth/oauth/google', { intent: 'signin', next: '/routes/1' }))),
    ).toBe('/auth/continue?next=%2Froutes%2F1')
    expect(b.jar.written).toEqual([])
  })

  it.each([
    ['whose env is incomplete', ORIGIN, ''],
    ['on another origin', 'https://preview.vercel.example', 'google-secret'],
  ])('starts nothing for a provider %s', async (_case, origin, secret) => {
    env.GOOGLE_CLIENT_SECRET = secret
    const b = browser(origin)

    expect(await locationOf(() => start(b.event('POST', '/auth/oauth/google', { intent: 'signin' })))).toBe(
      '/auth/error?reason=failed',
    )
    expect(b.jar.written).toEqual([])
  })
})

describe.skipIf(!reachable)('the Google round trip', () => {
  it('signs a new person in with the raw nonce at GoTrue under the secret key, and leaves a cookie session', async () => {
    issuer.issue({ email: uniqueEmail('new'), sub: `sub-${crypto.randomUUID()}` })
    nonce.fixed = RAW_NONCE
    const b = browser()
    const { landed } = await signIn(b, 'google', { form: { next: '/invite/accept?token=x' } })

    expect(landed).toBe('/auth/continue?next=%2Finvite%2Faccept%3Ftoken%3Dx')
    const [idToken] = gotrue.filter(({ url }) => url.pathname === '/auth/v1/token')
    expect(idToken.url.searchParams.get('grant_type')).toBe('id_token')
    expect(idToken.body).toMatchObject({ nonce: RAW_NONCE, provider: 'google' })
    expect(idToken.headers.get('apikey')).toBe(SECRET)
    expect(idToken.headers.has('authorization')).toBe(false)

    expect(decodeJwt((await cookieAccessToken(b)) ?? '').sub).toBe(account.id)
    expect(b.jar.values.get(LAST_METHOD)).toBe('google')
  })

  it('remembers no method and ends the minted session when the session cannot be written', async () => {
    issuer.issue({ email: uniqueEmail('unwritten'), sub: `sub-${crypto.randomUUID()}` })
    refuseUser = true
    const b = browser()

    expect(reasonOf((await signIn(b, 'google')).landed)).toBe('failed')
    expect(b.jar.values.has(LAST_METHOD)).toBe(false)
    expect(gotrue.filter(({ url }) => url.pathname === '/auth/v1/logout')).toHaveLength(1)
  })

  it('refuses a deletion-marked account: its session ends, no cookie, back to sign-in', async () => {
    await sql`insert into auth.users (id, email) values (${account.id}, ${uniqueEmail('deleted')})`
    try {
      await sql`insert into public.auth_events (auth_user_fk, kind) values (${account.id}, 'account_deleted')`
      issuer.issue({ email: uniqueEmail('deleted'), sub: `sub-${crypto.randomUUID()}` })
      const b = browser()
      const { landed } = await signIn(b, 'google')

      expect(landed).toBe('/auth/signin?deleted=1')
      expect(b.jar.values.size).toBe(0)
      const [logout] = gotrue.filter(({ url }) => url.pathname === '/auth/v1/logout')
      expect(logout.url.searchParams.get('scope')).toBe('local')
      expect(decodeJwt(logout.headers.get('authorization')?.replace('Bearer ', '') ?? '').sub).toBe(account.id)
    } finally {
      await sql`delete from public.auth_events where auth_user_fk = ${account.id}`
      await sql`delete from auth.users where id = ${account.id}`
    }
  })

  it('takes a contested account over with a refreshed session the verifier accepts', async () => {
    account.app_metadata = { contested_signup: true }
    issuer.issue({ email: uniqueEmail('contested'), sub: `sub-${crypto.randomUUID()}` })
    const b = browser()

    expect((await signIn(b, 'google')).landed).toBe('/explore')
    expect((await verifyAccessToken(await cookieAccessToken(b))).ok).toBe(true)
  })

  it('sends redirectUri as the token request redirect_uri, even on another host', async () => {
    issuer.issue({ email: uniqueEmail('host'), sub: `sub-${crypto.randomUUID()}` })
    const b = browser()
    const authorizeUrl = new URL(
      await locationOf(() => start(b.event('POST', '/auth/oauth/google', { intent: 'signin' }))),
    )
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    const other: { url: URL } = b.event(
      'GET',
      `/auth/callback/google?code=c&state=${authorizeUrl.searchParams.get('state')}`,
    )
    other.url = new URL(other.url.pathname + other.url.search, 'https://alias.example')
    await locationOf(() => googleCallback(other as never))

    expect(issuer.tokenRequests[0].body.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback/google`)
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/set\ttings', '/auth/signin'])(
    'lands a next of %j on /explore',
    async (next) => {
      issuer.issue({ email: uniqueEmail('next'), sub: `sub-${crypto.randomUUID()}` })

      expect((await signIn(browser(), 'google', { form: { next } })).landed).toBe('/explore')
    },
  )

  it('refuses a confirmed account at example.org before GoTrue, and records it', async () => {
    const email = uniqueEmail('confirmed')
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${email}, now()) returning id`
    try {
      issuer.issue({ email, sub: `sub-${crypto.randomUUID()}` })
      const before = await eventCount('oauth_link_refused')

      const { landed } = await signIn(browser(), 'google')

      expect(landed).toBe('/auth/error?from=%2Fauth%2Fsignin%3Fform%3Dsignin&intent=signin&reason=exists')
      expect(gotrue).toEqual([])
      expect(await eventCount('oauth_link_refused')).toBe(before + 1)
    } finally {
      await sql`delete from auth.users where id = ${id}`
    }
  })

  it('signs a provider-domain account straight in, writing no grant', async () => {
    const email = uniqueEmail('owned').replace('example.test', 'gmail.com')
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${email}, now()) returning id`
    try {
      issuer.issue({ email, sub: `sub-${crypto.randomUUID()}` })

      expect((await signIn(browser(), 'google')).landed).toBe('/explore')
      expect(gotrue.some(({ url }) => url.searchParams.get('grant_type') === 'id_token')).toBe(true)
      expect(await sql`select 1 from public.reauth_grants where auth_user_fk = ${id}`).toHaveLength(0)
    } finally {
      await sql`delete from auth.users where id = ${id}`
    }
  })

  it('lands a transaction 10 min 1 s old on expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const b = browser()
    const authorizeUrl = new URL(
      await locationOf(() => start(b.event('POST', '/auth/oauth/google', { intent: 'signin' }))),
    )
    vi.setSystemTime(Date.now() + 601_000)
    const landed = await locationOf(() =>
      googleCallback(b.event('GET', `/auth/callback/google?code=c&state=${authorizeUrl.searchParams.get('state')}`)),
    )

    expect(landed).toBe('/auth/error?from=%2Fauth%2Fsignin%3Fform%3Dsignin&intent=signin&reason=expired')
    expect(issuer.tokenRequests).toEqual([])
  })

  it("pins the provider: a Google transaction on Apple's route is expired and recorded", async () => {
    const before = await eventCount('oauth_iss_mismatch')
    const b = browser()
    const authorizeUrl = new URL(
      await locationOf(() => start(b.event('POST', '/auth/oauth/google', { intent: 'signin' }))),
    )
    const landed = await locationOf(() =>
      appleCallback(b.event('GET', `/auth/callback/apple?code=c&state=${authorizeUrl.searchParams.get('state')}`)),
    )

    await expectRecorded(landed, 'expired', 'oauth_iss_mismatch', before)
    expect(issuer.tokenRequests).toEqual([])
  })

  it('refuses a mismatched state and records it', async () => {
    const before = await eventCount('oauth_state_mismatch')
    const { landed } = await signIn(browser(), 'google', { answer: { state: 'not-the-state' } })

    await expectRecorded(landed, 'expired', 'oauth_state_mismatch', before)
    expect(issuer.tokenRequests).toEqual([])
  })

  it("refuses Google's legacy bare issuer and records the value it carried", async () => {
    const recorded = async () =>
      (
        await sql<{ n: number }[]>`select count(*)::int as n from public.auth_events
          where kind = 'oauth_iss_mismatch' and detail->>'iss' = 'accounts.google.com'`
      )[0].n
    const before = await recorded()
    issuer.issue({ email: uniqueEmail('bare-iss'), iss: 'accounts.google.com', sub: 'sub-iss' })
    const { landed } = await signIn(browser(), 'google')

    expect(reasonOf(landed)).toBe('failed')
    expect(await recorded()).toBeGreaterThan(before)
    expect(gotrue).toEqual([])
  })

  it("refuses an ID token carrying another transaction's nonce, and records it", async () => {
    const before = await eventCount('oauth_nonce_mismatch')
    issuer.issue({ email: uniqueEmail('nonce'), nonce: RAW_NONCE_DIGEST, sub: 'sub-n' })
    const { landed } = await signIn(browser(), 'google')

    await expectRecorded(landed, 'failed', 'oauth_nonce_mismatch', before)
    expect(gotrue).toEqual([])
  })

  it('cancels quietly to where the sign-in started, with the cookie gone', async () => {
    const b = browser()
    const { landed } = await signIn(b, 'google', { answer: { error: 'access_denied' }, form: { screen: 'signup' } })

    expect(landed).toBe('/auth/signup?form=signup')
    expect(b.jar.values.size).toBe(0)
  })

  it('cancels a start from an unknown screen to the sign-in form', async () => {
    const { landed } = await signIn(browser(), 'google', {
      answer: { error: 'access_denied' },
      form: { screen: 'evil' },
    })

    expect(landed).toBe('/auth/signin?form=signin')
  })
})

describe.skipIf(!reachable)('the Apple round trip', () => {
  it("answers Apple's cross-site form_post with a 303 to the GET, setting no cookie, and the GET completes", async () => {
    issuer.issue({
      email: uniqueEmail('apple').replace('example.test', 'privaterelay.appleid.com'),
      sub: 'apple-sub-1',
    })
    const b = browser()
    const authorizeUrl = new URL(
      await locationOf(() => start(b.event('POST', '/auth/oauth/apple', { intent: 'signin' }))),
    )
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    expect(authorizeUrl.searchParams.get('response_mode')).toBe('form_post')

    // A cross-site POST carries no Lax cookie: Apple's answer arrives from a cookieless view of the browser.
    const crossSite = browser()
    const state = authorizeUrl.searchParams.get('state') ?? ''
    const form = { code: 'code-1', state, user: '{"name":{"firstName":"Ana"}}' }
    const posted = await locationOf(() => applePost(crossSite.event('POST', '/auth/callback/apple', form)))

    expect(posted).toBe(`/auth/callback/apple?${new URLSearchParams({ code: 'code-1', state })}`)
    expect(crossSite.jar.written).toEqual([])
    expect(await locationOf(() => appleCallback(b.event('GET', posted)))).toBe('/explore')
    expect(issuer.tokenRequests[0].body.has('code_verifier')).toBe(false)
  })
})

describe('dispatchIntent', () => {
  it.each(['link', 'confirm'] as const)(
    "refuses a %s without the caller's token before any GoTrue call",
    async (kind) => {
      const caller = { authUserId: 'auth-user-1', sessionId: 'session-1' }
      const intent =
        kind === 'link' ? { caller, kind } : { action: 'account.delete' as const, caller, kind, target: 'self' }
      const tx = {
        carrier: 'web' as const,
        codeVerifier: 'v',
        intent,
        next: null,
        nonce: RAW_NONCE,
        provider: 'apple' as const,
        returnTo: '/settings',
        startedAt: Date.now(),
        state: 's',
      }
      const event = browser().event('GET', '/auth/callback/apple')
      const idToken = await signIdToken('apple', { sub: 'sub-1' })

      const outcome = await dispatchIntent({ authServer: supabaseAuthServer(event), event }, tx, {
        claims: { aud: 'a', exp: 0, iat: 0, iss: 'i', sub: 'sub-1' },
        idToken,
        rawNonce: RAW_NONCE,
      })

      expect(outcome).toEqual({ kind: 'refused', reason: 'expired' })
      expect(gotrue).toEqual([])
    },
  )
})

const made: string[] = []
afterEach(async () => {
  if (made.length > 0) await sql`delete from auth.users where id = any(${made.splice(0)})`
})

const confirmedAccount = (email = uniqueEmail('linker')) => confirmedAccountIn(made, email)

const callerOf = (token: VerifiedToken) => ({ authUserId: token.claims.sub, sessionId: token.claims.session_id! })

function answerOn(b: Browser, provider: 'apple' | 'google', authorizeUrl: URL, answer: Record<string, string> = {}) {
  const query = new URLSearchParams({ code: 'c', state: authorizeUrl.searchParams.get('state') ?? '', ...answer })
  const callback = provider === 'google' ? googleCallback : appleCallback
  return locationOf(() => callback(b.event('GET', `/auth/callback/${provider}?${query}`)))
}

function startSignedIn(b: Browser, provider: 'apple' | 'google', form: Record<string, string>) {
  const event: RequestEvent = b.event('POST', `/auth/oauth/${provider}`, form)
  return locationOf(() => with_request_store({ event, state: {} } as never, () => start(event as never)))
}

describe.skipIf(!reachable)('linking from settings', () => {
  const startLink = (b: Browser, form: Record<string, string> = {}) =>
    startSignedIn(b, 'google', { intent: 'link', ...form })

  async function startRemembered(b: Browser) {
    const authorizeUrl = new URL(await startLink(b))
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    return authorizeUrl
  }

  /** An account holding this session's identity.link grant, with the provider about to vouch for `sub`. */
  async function grantedAccount(label: string) {
    const { id, session } = await confirmedAccount()
    const token = await session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const sub = `sub-${crypto.randomUUID()}`
    issuer.issue({ email: uniqueEmail(label), sub })
    return { id, sub, token }
  }

  const link = async (b: Browser) => answerOn(b, 'google', await startRemembered(b))

  const linkCalls = () => gotrue.filter(({ body }) => body.link_identity === true)

  it('starts nothing without an identity.link grant, back to the step', async () => {
    const b = browser(ORIGIN, await (await confirmedAccount()).session())

    expect(await startLink(b)).toBe('/settings/sign-in-methods?step=add-google')
    expect(b.jar.written).toEqual([])
  })

  it('ignores a posted return path: a cancel comes back to the step', async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const b = browser(ORIGIN, token)
    const authorizeUrl = new URL(await startLink(b, { returnTo: 'https://evil.example' }))

    expect(await answerOn(b, 'google', authorizeUrl, { error: 'access_denied' })).toBe(
      '/settings/sign-in-methods?step=add-google',
    )
  })

  it("binds the grant to the verified identity, links as the caller and ends the link's own session", async () => {
    const { id, sub, token } = await grantedAccount('linked')
    nonce.fixed = RAW_NONCE
    const before = await eventCount('identity_linked')

    const b = browser(ORIGIN, token)
    expect(await link(b)).toBe('/settings/sign-in-methods?step=add-google&linked=google')
    const [call] = linkCalls()
    expect(call.headers.get('authorization')).toBe(`Bearer ${token.accessToken}`)
    expect(call.headers.get('apikey')).toBe(SECRET)
    expect(call.body).toMatchObject({ nonce: RAW_NONCE, provider: 'google' })
    const [logout] = gotrue.filter(({ url }) => url.pathname === '/auth/v1/logout')
    expect(logout.url.searchParams.get('scope')).toBe('local')
    expect(logout.headers.get('authorization')).not.toBe(`Bearer ${token.accessToken}`)
    expect(await sql`select target from public.reauth_grants where auth_user_fk = ${id}`).toEqual([
      { target: `google:${sub}` },
    ])
    expect(await eventCount('identity_linked')).toBe(before + 1)
    expect(b.jar.written.map(({ name }) => name)).not.toContain(LAST_METHOD)
  })

  // A link that did happen spent the grant in GoTrue's transaction, so restoring it is always safe.
  it.each([500, 429, 422])('after GoTrue answers %i, gives the grant back to "Try again"', async (status) => {
    const { id, token } = await grantedAccount('refused')
    refuseLink = status

    expect(reasonOf(await link(browser(ORIGIN, token)))).toBe('failed')
    expect(linkCalls()).toHaveLength(1)
    expect(await sql`select target from public.reauth_grants where auth_user_fk = ${id}`).toEqual([
      { target: 'google' },
    ])
  })

  it('refuses an identity already on another account, recording it, with no GoTrue link', async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const other = await confirmedAccount()
    const sub = `sub-${crypto.randomUUID()}`
    await sql.begin(async (tx) => {
      await tx`select set_config('grnyte.auth_user_created', ${other.id}, true)`
      await tx`insert into auth.identities (user_id, provider, provider_id, identity_data)
        values (${other.id}, 'google', ${sub}, ${tx.json({ email: other.email })})`
    })
    issuer.issue({ email: uniqueEmail('elsewhere'), sub })
    const before = await eventCount('oauth_link_refused')

    await expectRecorded(
      await link(browser(ORIGIN, token)),
      'conflict_identity',
      'oauth_link_refused',
      before,
      'google',
    )
    expect(linkCalls()).toEqual([])
  })

  it("refuses another account's address in another case, recording it, with no GoTrue link", async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const other = await confirmedAccount()
    issuer.issue({ email: other.email.toUpperCase(), sub: `sub-${crypto.randomUUID()}` })
    const before = await eventCount('oauth_link_refused')

    await expectRecorded(await link(browser(ORIGIN, token)), 'conflict_email', 'oauth_link_refused', before, 'google')
    expect(linkCalls()).toEqual([])
  })

  it('lands on expired when the callback carries another session of the same account', async () => {
    const { session } = await confirmedAccount()
    const token = await session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    issuer.issue({ email: uniqueEmail('switched'), sub: `sub-${crypto.randomUUID()}` })
    const b = browser(ORIGIN, token)
    const authorizeUrl = await startRemembered(b)
    b.as.token = await session()

    const landed = await answerOn(b, 'google', authorizeUrl)
    expect(reasonOf(landed)).toBe('expired')
    expect(linkCalls()).toEqual([])
  })

  it('lands on expired when the session was revoked after the start', async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    issuer.issue({ email: uniqueEmail('revoked'), sub: `sub-${crypto.randomUUID()}` })
    const b = browser(ORIGIN, token)
    const authorizeUrl = await startRemembered(b)
    await sql`delete from auth.sessions where id = ${token.claims.session_id!}`

    const landed = await answerOn(b, 'google', authorizeUrl)
    expect(reasonOf(landed)).toBe('expired')
    expect(linkCalls()).toEqual([])
  })
})

describe.skipIf(!reachable)('confirming with Apple', () => {
  async function appleAccount(sub = `apple-${crypto.randomUUID()}`) {
    const account = await confirmedAccount(uniqueEmail('confirmer'))
    await sql.begin(async (tx) => {
      await tx`select set_config('grnyte.auth_user_created', ${account.id}, true)`
      await tx`insert into auth.identities (user_id, provider, provider_id, identity_data)
        values (${account.id}, 'apple', ${sub}, ${tx.json({ email: account.email })})`
    })
    return { ...account, sub, token: await account.session() }
  }

  async function startConfirm(b: Browser, form: Record<string, string>) {
    const authorizeUrl = new URL(await startSignedIn(b, 'apple', { intent: 'confirm', ...form }))
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    return authorizeUrl
  }

  async function confirm(b: Browser, form: Record<string, string>, sub: string) {
    const authorizeUrl = await startConfirm(b, form)
    issuer.issue({ sub })
    return answerOn(b, 'apple', authorizeUrl)
  }

  const grants = (id: string) =>
    sql<{ action: string; method: string; target: string }[]>`
      select action, method, target from public.reauth_grants where auth_user_fk = ${id}`
  const regionDelete = { action: 'region.delete', returnTo: '/regions/1/delete', target: '1' }

  it('starts nothing for an account without Apple, back to the screen', async () => {
    const b = browser(ORIGIN, await (await confirmedAccount()).session())

    expect(await startSignedIn(b, 'apple', { intent: 'confirm', ...regionDelete })).toBe('/regions/1/delete')
    expect(b.jar.written).toEqual([])
  })

  it("starts nothing for a target past the remotes' bound", async () => {
    const b = browser(ORIGIN, (await appleAccount()).token)
    const form = { action: 'region.delete', intent: 'confirm' }

    await expect(startSignedIn(b, 'apple', { ...form, target: '1'.repeat(81) })).rejects.toMatchObject({ status: 400 })
    expect(b.jar.written).toEqual([])
  })

  it('starts for identity.link on a bare provider only', async () => {
    const b = browser(ORIGIN, (await appleAccount()).token)
    const form = { action: 'identity.link', intent: 'confirm' }

    await expect(startSignedIn(b, 'apple', { ...form, target: 'google:123' })).rejects.toMatchObject({ status: 400 })
    expect(b.jar.written).toEqual([])
    expect(await startSignedIn(b, 'apple', { ...form, target: 'google' })).toMatch(/^https:\/\/appleid\.apple\.com\//)
  })

  it.each([
    ['https://evil.example', '/settings'],
    ['//evil.example', '/settings'],
    ['/regions/1/delete', '/regions/1/delete'],
  ])('cancels a posted returnTo of %j to %j', async (returnTo, landed) => {
    const b = browser(ORIGIN, (await appleAccount()).token)
    const authorizeUrl = await startConfirm(b, { ...regionDelete, returnTo })

    expect(await answerOn(b, 'apple', authorizeUrl, { error: 'user_cancelled_authorize' })).toBe(landed)
  })

  it('grants exactly the sealed action and target, by Apple, and revokes nothing for it', async () => {
    const { id, sub, token } = await appleAccount()

    const b = browser(ORIGIN, token)
    expect(await confirm(b, regionDelete, sub)).toBe('/regions/1/delete')
    expect(b.jar.values.has(LAST_METHOD)).toBe(false)
    expect(await grants(id)).toEqual([{ action: 'region.delete', method: 'apple', target: '1' }])
    expect(await pinnedTx((tx) => spendGrant(tx, callerOf(token), 'region.delete', '2'))).toBe(false)
    expect(await grants(id)).toHaveLength(1)
    expect(issuer.revocations).toEqual([])
  })

  it('refuses another Apple ID, recording it, with no grant', async () => {
    const { id, token } = await appleAccount()
    const before = await eventCount('oauth_sub_mismatch')

    await expectRecorded(
      await confirm(browser(ORIGIN, token), regionDelete, 'someone-else'),
      'failed',
      'oauth_sub_mismatch',
      before,
    )
    expect(await grants(id)).toEqual([])
  })

  it('writes no grant from another session of the same account', async () => {
    const { id, session, sub, token } = await appleAccount()
    const b = browser(ORIGIN, token)
    const authorizeUrl = await startConfirm(b, regionDelete)
    issuer.issue({ sub })
    b.as.token = await session()

    expect(reasonOf(await answerOn(b, 'apple', authorizeUrl))).toBe('expired')
    expect(await grants(id)).toEqual([])
  })

  it('writes no grant when the session was revoked after the start', async () => {
    const { id, sub, token } = await appleAccount()
    const b = browser(ORIGIN, token)
    const authorizeUrl = await startConfirm(b, regionDelete)
    issuer.issue({ sub })
    await sql`delete from auth.sessions where id = ${token.claims.session_id!}`

    expect(reasonOf(await answerOn(b, 'apple', authorizeUrl))).toBe('expired')
    expect(await grants(id)).toEqual([])
  })

  it.each([
    ['account.delete', 'self'],
    ['identity.unlink', 'apple'],
  ])('revokes Apple before granting %s, and records it', async (action, sent) => {
    const { id, sub, token } = await appleAccount()
    const target = sent === 'self' ? id : sent
    let grantedAtRevoke: number | undefined
    issuer.revoke.answer = async () => {
      grantedAtRevoke = (await grants(id)).length
      return 200
    }

    await confirm(browser(ORIGIN, token), { action, returnTo: '/settings', target: sent }, sub)

    expect(issuer.revocations.map((body) => body.get('token'))).toEqual(['apple-refresh'])
    expect(grantedAtRevoke).toBe(0)
    expect(await grants(id)).toEqual([{ action, method: 'apple', target }])
    expect(
      await sql`select detail from public.auth_events where auth_user_fk = ${id} and kind = 'apple_revoked'`,
    ).toEqual([{ detail: { action, provider: 'apple', target } }])
  })

  it('records a failed revocation and still grants', async () => {
    const { id, sub, token } = await appleAccount()
    issuer.revoke.answer = () => 400

    await confirm(browser(ORIGIN, token), { action: 'account.delete', returnTo: '/settings', target: 'self' }, sub)

    expect(
      await sql`select 1 from public.auth_events where auth_user_fk = ${id} and kind = 'apple_revoke_failed'`,
    ).toHaveLength(1)
    expect(await grants(id)).toHaveLength(1)
  })

  it('lands a confirmation 10 min 1 s late on expired, whose action leads back to the screen', async () => {
    const { token } = await appleAccount()
    vi.useFakeTimers({ toFake: ['Date'] })
    const b = browser(ORIGIN, token)
    const authorizeUrl = await startConfirm(b, regionDelete)
    vi.setSystemTime(Date.now() + 601_000)

    expect(await answerOn(b, 'apple', authorizeUrl)).toBe(
      '/auth/error?from=%2Fregions%2F1%2Fdelete&intent=confirm&reason=expired',
    )
  })
})
