import type { VerifiedToken } from '$lib/auth'
import { cookieJar } from '$lib/auth/oauth/cookieJar.fixture'
/**
 * The tracer: the start POST, the shared fake issuer, the callback, GoTrue faked at fetch and the
 * throwaway DB. One browser per test, a cookie jar carried from request to request.
 */
import { fakeIssuer, PROVIDER_ENV, RAW_NONCE, RAW_NONCE_DIGEST, signIdToken } from '$lib/auth/oauth/issuer.fixture'
import { reachable, sql } from '$lib/db/testDb'
import { createServerClient } from '@supabase/ssr'
import type { RequestEvent } from '@sveltejs/kit'
import { with_request_store } from '@sveltejs/kit/internal/server'
import { decodeJwt, SignJWT } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGIN = 'https://grnyte.example'
const SUPABASE = 'http://supabase.test'
const SECRET = 'sb_secret_test'

const JWT_SECRET = 'tracer-jwt-secret-at-least-32-characters'
const env = vi.hoisted((): Record<string, string> => ({
  SUPABASE_JWT_SECRET: 'tracer-jwt-secret-at-least-32-characters',
}))
vi.mock('$env/dynamic/private', () => ({ env }))
// Repeated runs pile up mismatch events past the spike threshold; no admin mail from a test.
vi.mock('$lib/entities/notification/adminAlert.server', () => ({ alertAppAdmins: vi.fn() }))
vi.mock('$env/static/public', async (actual) => ({
  ...(await actual()),
  PUBLIC_ORIGIN: 'https://grnyte.example',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  PUBLIC_SUPABASE_URL: 'http://supabase.test',
}))
vi.mock('$env/static/private', async (actual) => ({ ...(await actual()), SUPABASE_SECRET_KEY: 'sb_secret_test' }))
const nonce = vi.hoisted(() => ({ fixed: undefined as string | undefined }))
vi.mock('openid-client', async (actual) => {
  const library = await actual<typeof import('openid-client')>()
  return { ...library, randomNonce: () => nonce.fixed ?? library.randomNonce() }
})

const { match } = await import('../../../../params/oauthProvider')
const { POST: start } = await import('../oauth/[provider=oauthProvider]/+server')
const { GET: googleCallback } = await import('./google/+server')
const { GET: appleCallback, POST: applePost } = await import('./apple/+server')
const { dispatchIntent } = await import('$lib/auth/oauth/flow.server')
const { supabaseAuthServer } = await import('$lib/auth/authServer.server')
const { verifyAccessToken } = await import('$lib/auth/verify.server')
const { writeGrant } = await import('$lib/auth/reauth.server')

interface GoTrueCall {
  body: Record<string, unknown>
  headers: Headers
  url: URL
}

let gotrue: GoTrueCall[] = []
let issuer: ReturnType<typeof fakeIssuer>
/** The account GoTrue answers every call with; a refresh answers it without the contested flag. */
let account: { app_metadata: Record<string, unknown>; id: string }

/** A GoTrue access token, signed as the local stack signs them. */
const accessToken = (user: typeof account, sessionId: string = crypto.randomUUID()) =>
  new SignJWT({ app_metadata: user.app_metadata, role: 'authenticated', session_id: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setSubject(user.id)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET))

beforeEach(() => {
  gotrue = []
  issuer = fakeIssuer()
  nonce.fixed = undefined
  account = { app_metadata: {}, id: crypto.randomUUID() }
  Object.assign(env, PROVIDER_ENV)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== SUPABASE) throw new Error(`unexpected fetch ${url.href}`)
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}))
    gotrue.push({ body, headers: request.headers, url })
    if (url.searchParams.get('grant_type') === 'refresh_token') account = { ...account, app_metadata: {} }
    const user = { aud: 'authenticated', email: 'new@example.test', role: 'authenticated', ...account }
    if (url.pathname === '/auth/v1/user' || url.pathname.startsWith('/auth/v1/admin/')) return Response.json(user)
    return Response.json({
      access_token: await accessToken(account),
      expires_in: 3600,
      refresh_token: 'refresh-1',
      token_type: 'bearer',
      user,
    })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

type Browser = ReturnType<typeof browser>

/** One browser: what it sends on each request, and every Set-Cookie it received. */
function browser(origin = ORIGIN, signedIn?: VerifiedToken) {
  const jar = cookieJar()
  const as = { token: signedIn }
  const event = (method: string, path: string, form?: Record<string, string>): never => {
    const url = new URL(path, origin)
    const body = form == null ? undefined : new URLSearchParams(form)
    const supabase = createServerClient(SUPABASE, 'sb_publishable_test', {
      cookies: {
        getAll: () => jar.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, options, value }) => jar.cookies.set(name, value, { ...options, path: '/' })),
      },
    })
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

/** Where a handler redirected; Kit's redirect is thrown. */
async function locationOf(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (thrown) {
    const { location, status } = (thrown ?? {}) as { location?: string; status?: number }
    if (status === 303 && location != null) return location
    throw thrown
  }
  throw new Error('no redirect')
}

/** Presses "Continue with" and answers the provider's redirect with `answer` on the callback. */
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

/** Landed on the error page with `reason`, and one more `kind` event recorded. */
async function expectRecorded(landed: string, reason: string, kind: string, before: number) {
  expect(new URL(landed, ORIGIN).searchParams.get('reason')).toBe(reason)
  expect(await eventCount(kind)).toBe(before + 1)
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

    expect(landed).toBe('/invite/accept?token=x')
    const [idToken] = gotrue.filter(({ url }) => url.pathname === '/auth/v1/token')
    expect(idToken.url.searchParams.get('grant_type')).toBe('id_token')
    expect(idToken.body).toMatchObject({ nonce: RAW_NONCE, provider: 'google' })
    expect(idToken.headers.get('apikey')).toBe(SECRET)
    expect(idToken.headers.has('authorization')).toBe(false)

    const after = createServerClient(SUPABASE, 'sb_publishable_test', {
      cookies: { getAll: () => b.jar.cookies.getAll(), setAll: () => {} },
    })
    const { data } = await after.auth.getSession()
    expect(decodeJwt(data.session?.access_token ?? '').sub).toBe(account.id)
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
    const after = createServerClient(SUPABASE, 'sb_publishable_test', {
      cookies: { getAll: () => b.jar.cookies.getAll(), setAll: () => {} },
    })
    const { data } = await after.auth.getSession()
    expect((await verifyAccessToken(data.session?.access_token)).ok).toBe(true)
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

describe.skipIf(!reachable)('linking from settings', () => {
  const made: string[] = []
  afterEach(async () => {
    await sql`delete from auth.users where id = any(${made.splice(0)})`
  })

  /** A confirmed account; `session()` signs it in on a fresh live session, as the hook verifies it. */
  async function confirmedAccount(email = uniqueEmail('linker')) {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${email}, now()) returning id`
    made.push(id)
    const session = async () => {
      const [row] = await sql<{ id: string }[]>`insert into auth.sessions (user_id) values (${id}) returning id`
      const verified = await verifyAccessToken(await accessToken({ app_metadata: {}, id }, row.id))
      if (!verified.ok) throw new Error(`token did not verify: ${verified.reason}`)
      return verified.token
    }
    return { email, id, session }
  }

  const callerOf = (token: VerifiedToken) => ({ authUserId: token.claims.sub, sessionId: token.claims.session_id! })

  /** Presses "Add Google" in settings: the start runs in Kit's request store, as `reauthCaller` needs. */
  async function startLink(b: Browser, form: Record<string, string> = {}) {
    const event: RequestEvent = b.event('POST', '/auth/oauth/google', { intent: 'link', ...form })
    return locationOf(() => with_request_store({ event, state: {} } as never, () => start(event as never)))
  }

  async function link(b: Browser) {
    const authorizeUrl = new URL(await startLink(b))
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    const query = new URLSearchParams({ code: 'code-1', state: authorizeUrl.searchParams.get('state') ?? '' })
    return locationOf(() => googleCallback(b.event('GET', `/auth/callback/google?${query}`)))
  }

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
    const query = new URLSearchParams({ error: 'access_denied', state: authorizeUrl.searchParams.get('state') ?? '' })

    expect(await locationOf(() => googleCallback(b.event('GET', `/auth/callback/google?${query}`)))).toBe(
      '/settings/sign-in-methods?step=add-google',
    )
  })

  it("binds the grant to the verified identity, links as the caller and ends the link's own session", async () => {
    const { id, session } = await confirmedAccount()
    const token = await session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const sub = `sub-${crypto.randomUUID()}`
    issuer.issue({ email: uniqueEmail('linked'), sub })
    nonce.fixed = RAW_NONCE
    const before = await eventCount('identity_linked')

    expect(await link(browser(ORIGIN, token))).toBe('/settings/sign-in-methods?step=add-google&linked=google')
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

    await expectRecorded(await link(browser(ORIGIN, token)), 'conflict_identity', 'oauth_link_refused', before)
    expect(linkCalls()).toEqual([])
  })

  it("refuses another account's address in another case, recording it, with no GoTrue link", async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const other = await confirmedAccount()
    issuer.issue({ email: other.email.toUpperCase(), sub: `sub-${crypto.randomUUID()}` })
    const before = await eventCount('oauth_link_refused')

    await expectRecorded(await link(browser(ORIGIN, token)), 'conflict_email', 'oauth_link_refused', before)
    expect(linkCalls()).toEqual([])
  })

  it('lands on expired when the callback carries another session of the same account', async () => {
    const { session } = await confirmedAccount()
    const token = await session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    issuer.issue({ email: uniqueEmail('switched'), sub: `sub-${crypto.randomUUID()}` })
    const b = browser(ORIGIN, token)
    const authorizeUrl = new URL(await startLink(b))
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    b.as.token = await session()
    const query = new URLSearchParams({ code: 'c', state: authorizeUrl.searchParams.get('state') ?? '' })

    const landed = await locationOf(() => googleCallback(b.event('GET', `/auth/callback/google?${query}`)))
    expect(new URL(landed, ORIGIN).searchParams.get('reason')).toBe('expired')
    expect(linkCalls()).toEqual([])
  })

  it('lands on expired when the session was revoked after the start', async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    issuer.issue({ email: uniqueEmail('revoked'), sub: `sub-${crypto.randomUUID()}` })
    const b = browser(ORIGIN, token)
    const authorizeUrl = new URL(await startLink(b))
    issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
    await sql`delete from auth.sessions where id = ${token.claims.session_id!}`
    const query = new URLSearchParams({ code: 'c', state: authorizeUrl.searchParams.get('state') ?? '' })

    const landed = await locationOf(() => googleCallback(b.event('GET', `/auth/callback/google?${query}`)))
    expect(new URL(landed, ORIGIN).searchParams.get('reason')).toBe('expired')
    expect(linkCalls()).toEqual([])
  })
})
