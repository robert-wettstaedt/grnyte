/**
 * The handoff (`oauth/start`, the callbacks with the app carrier first, `oauth/exchange`) and native Apple.
 * The shared fake issuer answers the provider, GoTrue is faked at fetch, rows live in the throwaway DB.
 */
import type { VerifiedToken } from '$lib/auth'
import { cookieJar } from '$lib/auth/oauth/cookieJar.fixture'
import {
  accessToken,
  confirmedAccount as confirmedAccountIn,
  cookieClient,
  fakeGoTrue,
  locationOf,
  ORIGIN,
  SECRET,
  type Account,
  type GoTrueCall,
} from '$lib/auth/oauth/goTrue.fixture'
import {
  fakeIssuer,
  PROVIDER_ENV,
  publicJwk,
  RAW_NONCE,
  signIdToken,
  signWithIssuerKey,
} from '$lib/auth/oauth/issuer.fixture'
import { reachable, sql } from '$lib/db/testDb'
import type { RequestEvent } from '@sveltejs/kit'
import { createLocalJWKSet, decodeJwt, generateKeyPair, SignJWT } from 'jose'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appCall } from './appRequest.fixture'

const env = vi.hoisted((): Record<string, string> => ({
  SUPABASE_JWT_SECRET: 'tracer-jwt-secret-at-least-32-characters',
}))
vi.mock('$env/dynamic/private', () => ({ env }))
// Recorded in memory: the auth log is shared with other files running at once, which count and clear it.
const recorded = vi.hoisted(() => vi.fn())
vi.mock('$lib/auth/server/events.server', async (actual) => ({ ...(await actual()), recordAuthEvent: recorded }))
// fallow-ignore-next-line code-duplication -- vi.mock is hoisted per file: each OAuth test declares its own
vi.mock('$env/static/public', async (actual) => ({
  ...(await actual()),
  ...(await import('$lib/auth/oauth/testEnv.fixture')).PUBLIC_ENV,
}))
vi.mock('$env/static/private', async (actual) => ({ ...(await actual()), SUPABASE_SECRET_KEY: 'sb_secret_test' }))
const nonce = vi.hoisted(() => ({ fixed: undefined as string | undefined }))
vi.mock('openid-client', async (actual) =>
  (await import('$lib/auth/oauth/testEnv.fixture')).withFixedNonce(await actual(), nonce),
)

const { POST: startEndpoint } = await import('../../../routes/api/app/v1/oauth/start/+server')
const { POST: exchangeEndpoint } = await import('../../../routes/api/app/v1/oauth/exchange/+server')
const { POST: webStart } = await import('../../../routes/(landing)/auth/oauth/[provider=oauthProvider]/+server')
const { GET: googleCallback } = await import('../../../routes/(landing)/auth/callback/google/+server')
const { GET: appleCallback, POST: applePost } = await import('../../../routes/(landing)/auth/callback/apple/+server')
const { providerHttp } = await import('$lib/auth/oauth/providers.server')
const { unseal } = await import('$lib/auth/oauth/seal.server')
const { HANDOFF_INFO } = await import('./carrier.server')
const { labelledKey } = await import('$lib/auth/server/keys.server')
const { verifyAccessToken } = await import('$lib/auth/server/verify.server')
const { writeGrant } = await import('$lib/auth/reauth/reauth.server')
const { V1 } = await import('./v1')
const { appleKeys } = await import('./appleToken.server')
const { POST: nativeEndpoint } = await import('../../../routes/api/app/v1/oauth/apple/native/+server')
const { POST: linkEndpoint } = await import('../../../routes/api/app/v1/identities/link/apple/+server')
const { POST: reauthStartEndpoint } = await import('../../../routes/api/app/v1/reauth/apple/start/+server')
const { POST: reauthConfirmEndpoint } = await import('../../../routes/api/app/v1/reauth/apple/confirm/+server')
const { POST: appleNotification } = await import('../../../routes/api/webhooks/apple/sign-in/+server')

let gotrue: GoTrueCall[] = []
let issuer: ReturnType<typeof fakeIssuer>
let account: Account
const startedAt = new Date()

beforeEach(() => {
  recorded.mockClear()
  // fallow-ignore-next-line code-duplication -- the same fresh issuer, account and GoTrue as the tracer's
  gotrue = []
  issuer = fakeIssuer()
  nonce.fixed = undefined
  account = { app_metadata: {}, id: crypto.randomUUID() }
  Object.assign(env, PROVIDER_ENV)
  fakeGoTrue(
    gotrue,
    () => account,
    (next) => (account = next),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const made: string[] = []
afterEach(async () => {
  if (made.length > 0) await sql`delete from auth.users where id = any(${made.splice(0)})`
})
afterAll(async () => {
  if (reachable) await sql`delete from public.app_auth_flows where created_at >= ${startedAt}`
})

const byte = () => Math.floor(Math.random() * 254) + 1
/** A fresh client per test, so the start cap of one test never reaches another. */
const freshAddress = () => `10.${byte()}.${byte()}.${byte()}`
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
const sha256hex = (value: string) => createHash('sha256').update(value).digest('hex')
const uniqueEmail = (label: string) => `__handoff_${label}_${crypto.randomUUID().slice(0, 8)}@example.test`
const handoffFailed = async (reason: string) =>
  recorded.mock.calls.filter(([kind, input]) => kind === 'handoff_failed' && input?.detail?.reason === reason).length
const eventCount = async (kind: string) => recorded.mock.calls.filter(([recordedKind]) => recordedKind === kind).length

type Locals = { claims?: unknown; user?: unknown; verifiedToken?: VerifiedToken }
interface StartInput {
  address?: string
  body?: Record<string, unknown>
  locals?: Locals
}

function start({ address = freshAddress(), body = {}, locals = {} }: StartInput = {}) {
  const verifier = randomBytes(32).toString('base64url')
  const sent = {
    codeChallenge: challengeOf(verifier),
    codeChallengeMethod: 'S256',
    provider: 'google',
    purpose: 'signin',
    returnChannel: 'ios',
    ...body,
  }
  return { address, response: appCall(startEndpoint, 'oauth/start', { address, body: sent, locals }), verifier }
}

/** A started flow the fake issuer will answer: its authorize URL, state and the app's verifier. */
async function started(input: StartInput = {}) {
  const { address, response, verifier } = start(input)
  const answer = await response
  const json = (await answer.json()) as { authorizeUrl?: string; error?: unknown }
  if (json.authorizeUrl == null) throw new Error(`start refused: ${JSON.stringify(json)}`)
  const authorizeUrl = new URL(json.authorizeUrl)
  issuer.rememberNonce(authorizeUrl.searchParams.get('nonce'))
  return { address, answer, authorizeUrl, state: authorizeUrl.searchParams.get('state') ?? '', verifier }
}

const rowsOf = (address: string) => sql`select * from public.app_auth_flows where client_hash = ${clientHash(address)}`
const clientHash = (key: string) =>
  createHmac('sha256', labelledKey('app-start-client'))
    .update(key.replace(/^::ffff:/, ''))
    .digest('hex')

/** The provider's return on the callback; Apple posts, then the browser follows the 303. */
async function providerReturn(
  provider: 'apple' | 'google',
  state: string,
  answer: Record<string, string> = {},
  jar = cookieJar(),
) {
  const query = { code: 'provider-code', state, ...answer }
  if (provider === 'google') {
    return locationOf(() => googleCallback(request('GET', `/auth/callback/google?${new URLSearchParams(query)}`, jar)))
  }
  const posted = await locationOf(() => applePost(request('POST', '/auth/callback/apple', cookieJar(), query)))
  return locationOf(() => appleCallback(request('GET', posted, jar)))
}

/** A browser's request: its cookie jar, and a cookie client over it as the hook builds one. */
function request(method: string, path: string, jar = cookieJar(), form?: Record<string, string>): never {
  const url = new URL(path, ORIGIN)
  // Built on first read, as the hook does on a callback: building it loads the web session.
  let client: ReturnType<typeof cookieClient> | undefined
  const locals = {
    backendUnavailable: false,
    claims: undefined,
    safeGetSession: async () => ({ claims: undefined, verifiedToken: undefined }),
  }
  Object.defineProperty(locals, 'supabase', { get: () => (client ??= cookieClient(jar)) })
  return {
    cookies: jar.cookies,
    getClientAddress: () => '198.51.100.7',
    isRemoteRequest: false,
    locals,
    params: { provider: path.split('/')[3] },
    request: new Request(url, { body: form == null ? undefined : new URLSearchParams(form), method }),
    url,
  } as unknown as RequestEvent as never
}

const codeOf = (landed: string) => new URL(landed).searchParams.get('code') ?? ''

const exchange = (code: string, codeVerifier: string, locals: Locals = {}) =>
  appCall(exchangeEndpoint, 'oauth/exchange', { body: { code, codeVerifier }, locals })

const confirmedAccount = (email = uniqueEmail('linker')) => confirmedAccountIn(made, email)

/** A whole sign-in through the handoff, up to the code the app receives. */
async function handedOff(input: StartInput = {}, provider: 'apple' | 'google' = 'google') {
  const flow = await started({ ...input, body: { provider, ...input.body } })
  const landed = await providerReturn(provider, flow.state)
  return { ...flow, code: codeOf(landed), landed }
}

const bearer = (token: VerifiedToken, user: unknown = { id: token.claims.sub }): Locals => ({
  claims: token.claims,
  user,
  verifiedToken: token,
})
const callerOf = (token: VerifiedToken) => ({ authUserId: token.claims.sub, sessionId: token.claims.session_id! })

describe.skipIf(!reachable)('oauth/start', () => {
  it.each([
    ['a plain challenge', { codeChallengeMethod: 'plain' }],
    ['no challenge', { codeChallenge: undefined }],
    ['a challenge of the wrong length', { codeChallenge: 'short' }],
    ['a return channel outside APP_RETURNS', { returnChannel: 'web' }],
  ])('stores nothing for %s', async (_case, body) => {
    const { address, response } = start({ body })

    expect((await response).status).toBe(400)
    expect(await rowsOf(address)).toHaveLength(0)
  })

  it.each([
    ['ios', `${ORIGIN}/app-return`],
    ['android', 'rocks.grnyte:/auth'],
  ])('seals the %s return into the transaction', async (returnChannel, returnTo) => {
    const { address } = await started({ body: { returnChannel } })
    const [row] = await rowsOf(address)

    expect(await unseal(HANDOFF_INFO, row.transaction)).toMatchObject({ carrier: 'app', returnTo })
  })

  it('refuses a provider this deployment has not configured', async () => {
    env.GOOGLE_CLIENT_SECRET = ''
    const { address, response } = start()

    expect((await response).status).toBe(400)
    expect(await rowsOf(address)).toHaveLength(0)
  })

  it('refuses a link from a caller without a profile', async () => {
    const token = await (await confirmedAccount()).session()
    await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
    const { address, response } = start({ body: { purpose: 'link' }, locals: bearer(token, null) })
    const answer = await response

    expect(answer.status).toBe(403)
    expect(await answer.json()).toEqual({ error: { code: 'profile_required' } })
    expect(await rowsOf(address)).toHaveLength(0)
  })

  it('refuses a link without an identity.link grant', async () => {
    const token = await (await confirmedAccount()).session()
    const { address, response } = start({ body: { purpose: 'link' }, locals: bearer(token) })
    const answer = await response

    expect(answer.status).toBe(403)
    expect(await answer.json()).toEqual({ error: { code: 'auth_reauthRequired' } })
    expect(await rowsOf(address)).toHaveLength(0)
  })

  /** Ten open flows from `address`, then the answer to an eleventh start from `next`. */
  async function eleventh(address: string, next = address, locals: Locals = {}) {
    for (let i = 0; i < 10; i++) await started({ address })
    return start({ address: next, locals }).response
  }

  it('refuses the 11th start while 10 are open, storing nothing', async () => {
    const address = freshAddress()
    const answer = await eleventh(address)

    expect(answer.status).toBe(429)
    expect(await answer.json()).toEqual({ error: { code: 'auth_tooManyStarts' } })
    expect(await rowsOf(address)).toHaveLength(10)
  })

  it('frees a slot for a claimed flow and for an expired one', async () => {
    const address = freshAddress()
    expect((await eleventh(address)).status).toBe(429)
    const hash = clientHash(address)

    await sql`update public.app_auth_flows set claimed_at = now()
      where id = (select id from public.app_auth_flows where client_hash = ${hash} limit 1)`
    expect((await start({ address }).response).status).toBe(200)
    await sql`update public.app_auth_flows set expires_at = now() - interval '1 second'
      where id = (select id from public.app_auth_flows where client_hash = ${hash} and claimed_at is null limit 1)`
    expect((await start({ address }).response).status).toBe(200)
    expect((await start({ address }).response).status).toBe(429)
  })

  it('caps two IPv6 addresses of one /64 together', async () => {
    const prefix = `2001:db8:${byte().toString(16)}:${byte().toString(16)}`

    expect((await eleventh(`${prefix}::a`, `${prefix}:ffff::b`)).status).toBe(429)
  })

  it('caps a start carrying a valid Bearer too', async () => {
    const token = await (await confirmedAccount()).session()

    expect((await eleventh(freshAddress(), undefined, bearer(token))).status).toBe(429)
  })

  it('caps a mapped IPv4 address with its plain form, and not with another mapped address', async () => {
    const address = freshAddress()
    expect((await eleventh(`::ffff:${address}`, address)).status).toBe(429)

    expect((await start({ address: `::ffff:${freshAddress()}` }).response).status).toBe(200)
  })

  it("keys the client as an HMAC under labelledKey('app-start-client')", async () => {
    const address = freshAddress()
    await started({ address })

    const [row] = await sql`select client_hash from public.app_auth_flows where client_hash = ${clientHash(address)}`
    expect(row.client_hash).not.toBe(sha256hex(address))
  })

  it("answers the provider URL for this flow's state on redirectUri, stores its hash only, and sets no cookie", async () => {
    const jar = cookieJar()
    const verifier = randomBytes(32).toString('base64url')
    const address = freshAddress()
    const answer = await appCall(startEndpoint, 'oauth/start', {
      address,
      body: {
        codeChallenge: challengeOf(verifier),
        codeChallengeMethod: 'S256',
        provider: 'google',
        purpose: 'signin',
        returnChannel: 'ios',
      },
      cookies: jar.cookies,
    })
    const body = V1['oauth/start'].response.parse(await answer.json())
    const url = new URL(body.authorizeUrl)
    const state = url.searchParams.get('state') ?? ''

    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback/google`)
    const [row] = await rowsOf(address)
    expect(row.state_hash).toBe(sha256hex(state))
    expect(JSON.stringify(row)).not.toContain(state)
    expect(await unseal(HANDOFF_INFO, row.transaction)).toMatchObject({ returnTo: `${ORIGIN}/app-return`, state })
    expect(jar.written).toEqual([])
    expect(answer.headers.get('set-cookie')).toBeNull()
  })
})

describe.skipIf(!reachable)('app_auth_flows at rest', () => {
  it('is invisible to app_writer and holds neither the raw nonce nor the provider verifier', async () => {
    const { address } = await started()
    const [row] = await rowsOf(address)
    const tx = await unseal<{ codeVerifier: string; nonce: string }>(HANDOFF_INFO, row.transaction)

    expect(JSON.stringify(row)).not.toContain(tx!.nonce)
    expect(JSON.stringify(row)).not.toContain(tx!.codeVerifier)
    const seen = await sql.begin(async (t) => {
      await t`set local role app_writer`
      return t`select id from public.app_auth_flows`
    })
    expect(seen).toHaveLength(0)
  })
})

describe.skipIf(!reachable)('the callback through the app carrier', () => {
  it.each([
    ['ios', 'google', `${ORIGIN}/app-return?code=`],
    ['android', 'google', 'rocks.grnyte:/auth?code='],
    ['ios', 'apple', `${ORIGIN}/app-return?code=`],
  ] as const)(
    'lands a %s %s flow on its return with a code, and seals the proof',
    async (returnChannel, provider, prefix) => {
      issuer.issue({ email: uniqueEmail('land'), sub: `sub-${crypto.randomUUID()}` })
      const { address, landed } = await handedOff({ body: { returnChannel } }, provider)

      expect(landed.startsWith(prefix)).toBe(true)
      expect(codeOf(landed)).toMatch(/^[A-Za-z0-9_-]{43}$/)
      const [row] = await rowsOf(address)
      expect(row.code_hash).toBe(sha256hex(codeOf(landed)))
      expect(await unseal(HANDOFF_INFO, row.proof)).toMatchObject({ claims: { sub: expect.any(String) } })
    },
  )

  it("refuses a code grant that never reaches the fake issuer's token endpoint", async () => {
    const flow = await started()
    providerHttp.fetch = () => Promise.reject(new Error('no issuer'))

    expect(await providerReturn('google', flow.state)).toBe(`${ORIGIN}/app-return?error=failed`)
  })

  it('answers a replayed state with expired, records it and never runs the code grant', async () => {
    const flow = await started()
    await providerReturn('google', flow.state)
    const before = await handoffFailed('state_replayed')

    expect(await providerReturn('google', flow.state)).toBe(`${ORIGIN}/app-return?error=expired`)
    expect(await handoffFailed('state_replayed')).toBe(before + 1)
    expect(issuer.tokenRequests).toHaveLength(1)
  })

  it('recognises a replay after the code was exchanged', async () => {
    issuer.issue({ email: uniqueEmail('replay'), sub: `sub-${crypto.randomUUID()}` })
    const flow = await handedOff()
    expect((await exchange(flow.code, flow.verifier)).status).toBe(200)

    expect(await providerReturn('google', flow.state)).toBe(`${ORIGIN}/app-return?error=expired`)
    expect(issuer.tokenRequests).toHaveLength(1)
  })

  it('lands a return 11 minutes after the start on expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const flow = await started()
    vi.setSystemTime(Date.now() + 11 * 60_000)

    expect(await providerReturn('google', flow.state)).toBe(`${ORIGIN}/app-return?error=expired`)
    expect(issuer.tokenRequests).toEqual([])
  })

  it('lands a provider cancellation on cancelled', async () => {
    const flow = await started({ body: { returnChannel: 'android' } })

    expect(await providerReturn('google', flow.state, { error: 'access_denied' })).toBe(
      'rocks.grnyte:/auth?error=cancelled',
    )
  })

  it("lands another issuer's token on failed with change 2's event and no handoff_failed", async () => {
    issuer.issue({ iss: 'https://evil.example', sub: 'sub-evil' })
    const flow = await started()
    const before = { failed: await eventCount('handoff_failed'), iss: await eventCount('oauth_iss_mismatch') }

    expect(await providerReturn('google', flow.state)).toBe(`${ORIGIN}/app-return?error=failed`)
    expect(await eventCount('oauth_iss_mismatch')).toBe(before.iss + 1)
    expect(await eventCount('handoff_failed')).toBe(before.failed)
  })

  it('sets no cookie and calls no GoTrue on a return carrying near-expiry web session cookies', async () => {
    const expiring = await accessToken(account)
    const jar = cookieJar({
      'sb-supabase-auth-token': `base64-${Buffer.from(
        JSON.stringify({ access_token: expiring, expires_at: Math.floor(Date.now() / 1000) + 5, refresh_token: 'r' }),
      ).toString('base64url')}`,
    })
    const flow = await started()

    expect(codeOf(await providerReturn('google', flow.state, {}, jar))).not.toBe('')
    expect(jar.written).toEqual([])
    expect(gotrue).toEqual([])
  })

  it("leaves the web carrier's cookie to a web sign-in through the same callback", async () => {
    issuer.issue({ email: uniqueEmail('web'), sub: `sub-${crypto.randomUUID()}` })
    const jar = cookieJar()
    const webUrl = new URL(
      await locationOf(() => webStart(request('POST', '/auth/oauth/google', jar, { intent: 'signin' }))),
    )
    const cookie = [...jar.values.keys()]
    const app = await started()

    expect(codeOf(await providerReturn('google', app.state, {}, jar))).not.toBe('')
    expect([...jar.values.keys()]).toEqual(cookie)
    issuer.rememberNonce(webUrl.searchParams.get('nonce'))
    expect(await providerReturn('google', webUrl.searchParams.get('state') ?? '', {}, jar)).toBe('/explore')
  })

  it('reaches the same dispatchIntent outcome as the web carrier for the same proof', async () => {
    nonce.fixed = RAW_NONCE
    const idTokenCall = () => {
      const call = gotrue.find(({ url }) => url.searchParams.get('grant_type') === 'id_token')
      const { id_token: idToken, ...body } = call?.body ?? {}
      // Each half mints its own ID token: the same claims, but stamped with its own clock.
      const { exp, iat, ...claims } = decodeJwt(String(idToken))
      return {
        apikey: call?.headers.get('apikey'),
        authorization: call?.headers.get('authorization'),
        body,
        claims,
        stamped: [typeof exp, typeof iat],
      }
    }
    const claims = { email: uniqueEmail('same'), sub: `sub-${crypto.randomUUID()}` }

    issuer.issue(claims)
    const jar = cookieJar()
    const webUrl = new URL(
      await locationOf(() => webStart(request('POST', '/auth/oauth/google', jar, { intent: 'signin' }))),
    )
    issuer.rememberNonce(webUrl.searchParams.get('nonce'))
    expect(await providerReturn('google', webUrl.searchParams.get('state') ?? '', {}, jar)).toBe('/explore')
    const web = idTokenCall()

    // The app half a second boundary later, as a slow run would cross one.
    vi.useFakeTimers({ now: Date.now() + 2000, toFake: ['Date'] })
    gotrue.length = 0
    const flow = await handedOff()
    const answer = await exchange(flow.code, flow.verifier)
    const { session } = (await answer.json()) as { session: { access_token: string } }

    expect(idTokenCall()).toEqual(web)
    expect(web.apikey).toBe(SECRET)
    expect(decodeJwt(session.access_token).sub).toBe(account.id)
  })
})

describe.skipIf(!reachable)('oauth/exchange', () => {
  beforeEach(() => issuer.issue({ email: uniqueEmail('x'), sub: `sub-${crypto.randomUUID()}` }))

  it('issues exactly one session to two concurrent exchanges of one code', async () => {
    const flow = await handedOff()
    let both: Promise<Response[]> | undefined
    await sql.begin(async (t) => {
      await t`select 1 from public.app_auth_flows where code_hash = ${sha256hex(flow.code)} for update`
      both = Promise.all([exchange(flow.code, flow.verifier), exchange(flow.code, flow.verifier)])
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    const answers = await both!

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 400])
    expect(gotrue.filter(({ url }) => url.searchParams.get('grant_type') === 'id_token')).toHaveLength(1)
  })

  it('keeps the row with its state and claim, and empties code and proof', async () => {
    const flow = await handedOff()
    const answer = await exchange(flow.code, flow.verifier)
    V1['oauth/exchange'].response.parse(await answer.json())

    const [row] = await rowsOf(flow.address)
    expect(row).toMatchObject({ code_hash: null, proof: null, state_hash: sha256hex(flow.state) })
    expect(row.claimed_at).not.toBeNull()
    expect(answer.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a code 61 s after the callback and records code_unknown', async () => {
    const flow = await handedOff()
    await sql`update public.app_auth_flows set expires_at = expires_at - interval '61 seconds'
      where code_hash = ${sha256hex(flow.code)}`
    const before = await handoffFailed('code_unknown')

    expect((await exchange(flow.code, flow.verifier)).status).toBe(400)
    expect(await handoffFailed('code_unknown')).toBe(before + 1)
    expect(gotrue).toEqual([])
  })

  it('spends the code on a wrong verifier, so the right one then fails too', async () => {
    const flow = await handedOff()
    const before = await handoffFailed('pkce_mismatch')

    expect((await exchange(flow.code, randomBytes(32).toString('base64url'))).status).toBe(400)
    expect(await handoffFailed('pkce_mismatch')).toBe(before + 1)
    expect((await exchange(flow.code, flow.verifier)).status).toBe(400)
    expect(gotrue).toEqual([])
  })

  it("answers the auto-link refusal as change 2's message key", async () => {
    const email = uniqueEmail('confirmed')
    await confirmedAccount(email)
    issuer.issue({ email, sub: `sub-${crypto.randomUUID()}` })
    const flow = await handedOff()
    const answer = await exchange(flow.code, flow.verifier)

    expect(answer.status).toBe(400)
    expect(await answer.json()).toEqual({ error: { code: 'auth_oauthExistsBody' } })
  })

  it('answers a contested sign-in with the refreshed session the verifier accepts', async () => {
    account.app_metadata = { contested_signup: true }
    const flow = await handedOff()
    const { session } = (await (await exchange(flow.code, flow.verifier)).json()) as {
      session: { access_token: string }
    }

    expect((await verifyAccessToken(session.access_token)).ok).toBe(true)
  })

  describe('a link', () => {
    async function linkFlow() {
      const { session } = await confirmedAccount()
      const token = await session()
      await writeGrant(callerOf(token), 'identity.link', 'google', 'email_code')
      issuer.issue({ email: uniqueEmail('linked'), sub: `sub-${crypto.randomUUID()}` })
      return { flow: await handedOff({ body: { purpose: 'link' }, locals: bearer(token) }), session, token }
    }

    it('links for the starting caller through its own token', async () => {
      const { flow, token } = await linkFlow()
      const answer = await exchange(flow.code, flow.verifier, bearer(token))

      expect(await answer.json()).toEqual({ linked: true })
      const [call] = gotrue.filter(({ body }) => body.link_identity === true)
      expect(call.headers.get('authorization')).toBe(`Bearer ${token.accessToken}`)
    })

    it('refuses another session of the same account and another account, recording it', async () => {
      const { flow, session } = await linkFlow()
      const other = await (await confirmedAccount()).session()
      const before = await handoffFailed('link_caller_mismatch')

      expect((await exchange(flow.code, flow.verifier, bearer(await session()))).status).toBe(403)
      const again = await linkFlow()
      expect((await exchange(again.flow.code, again.flow.verifier, bearer(other))).status).toBe(403)
      expect(await handoffFailed('link_caller_mismatch')).toBe(before + 2)
      expect(gotrue).toEqual([])
    })
  })
})

/** Native Apple: tokens signed with the fake issuer's key, served as a local key set. */
const APP_AUD = 'rocks.grnyte'
const rawNonce = () => randomBytes(32).toString('base64url')
const appleToken = (claims: { email?: string; nonce: string; sub?: string }) =>
  signIdToken('apple', { aud: APP_AUD, sub: `apple-${crypto.randomUUID()}`, ...claims })
/** The same claims under a key the set does not hold. */
async function forged(claims: { email?: string; nonce: string; sub?: string }) {
  const { privateKey } = await generateKeyPair('RS256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'fake-1' })
    .setIssuer('https://appleid.apple.com')
    .setAudience(APP_AUD)
    .setSubject(claims.sub ?? 'apple-forged')
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey)
}
const linkCalls = () => gotrue.filter(({ body }) => body.link_identity === true)

describe.skipIf(!reachable)('native Apple', () => {
  beforeEach(() => {
    appleKeys.source = createLocalJWKSet({ keys: [publicJwk] })
  })

  describe('oauth/apple/native', () => {
    const native = (body: { idToken: string; rawNonce: string }) =>
      appCall(nativeEndpoint, 'oauth/apple/native', { body })

    it('answers a forged token alike for an address with an account and without, deciding nothing', async () => {
      const taken = uniqueEmail('taken')
      await confirmedAccount(taken)
      const answers = []
      for (const email of [taken, uniqueEmail('free')]) {
        const raw = rawNonce()
        const answer = await native({ idToken: await forged({ email, nonce: sha256hex(raw) }), rawNonce: raw })
        answers.push({ body: await answer.json(), status: answer.status })
      }

      expect(answers[0]).toEqual(answers[1])
      expect(answers[0]).toEqual({ body: { error: { code: 'auth_oauthFailedBody' } }, status: 400 })
      expect(await eventCount('oauth_link_refused')).toBe(0)
      expect(await handoffFailed('apple_token_invalid')).toBe(2)
      expect(gotrue).toEqual([])
    })

    it('refuses a raw nonce whose digest the token does not carry', async () => {
      const answer = await native({ idToken: await appleToken({ nonce: sha256hex(rawNonce()) }), rawNonce: rawNonce() })

      expect(answer.status).toBe(400)
      expect(gotrue).toEqual([])
    })

    it('refuses a confirmed account with the auto-link refusal key', async () => {
      const email = uniqueEmail('confirmed')
      await confirmedAccount(email)
      const raw = rawNonce()
      const answer = await native({ idToken: await appleToken({ email, nonce: sha256hex(raw) }), rawNonce: raw })

      expect(await answer.json()).toEqual({ error: { code: 'auth_oauthExistsBody' } })
      expect(gotrue).toEqual([])
    })

    it('signs a contested unconfirmed account in, clears its mark and answers a session the verifier accepts', async () => {
      const email = uniqueEmail('contested')
      await sql`insert into auth.users (id, email) values (${account.id}, ${email})`
      made.push(account.id)
      account.app_metadata = { contested_signup: true }
      const raw = rawNonce()
      const answer = await native({ idToken: await appleToken({ email, nonce: sha256hex(raw) }), rawNonce: raw })
      const { session } = V1['oauth/apple/native'].response.parse(await answer.json())

      const [idToken] = gotrue.filter(({ url }) => url.searchParams.get('grant_type') === 'id_token')
      expect(idToken.body).toMatchObject({ nonce: raw, provider: 'apple' })
      const [cleared] = gotrue.filter(({ url }) => url.pathname === `/auth/v1/admin/users/${account.id}`)
      expect(cleared.body).toMatchObject({ app_metadata: { contested_signup: null } })
      expect((await verifyAccessToken(session.access_token)).ok).toBe(true)
    })

    it('refuses when Apple is not configured here', async () => {
      env.APPLE_SERVICES_ID = ''
      const raw = rawNonce()
      const answer = await native({ idToken: await appleToken({ nonce: sha256hex(raw) }), rawNonce: raw })

      expect(answer.status).toBe(400)
      expect(gotrue).toEqual([])
    })
  })

  describe('identities/link/apple', () => {
    async function linker() {
      const token = await (await confirmedAccount()).session()
      await writeGrant(callerOf(token), 'identity.link', 'apple', 'email_code')
      return token
    }
    const link = (token: VerifiedToken, idToken: string, raw: string) =>
      appCall(linkEndpoint, 'identities/link/apple', { body: { idToken, rawNonce: raw }, locals: bearer(token) })

    it("links a verified token for the Bearer caller through the caller's own token", async () => {
      const token = await linker()
      const raw = rawNonce()
      const answer = await link(token, await appleToken({ email: uniqueEmail('l'), nonce: sha256hex(raw) }), raw)

      expect(await answer.json()).toEqual({ linked: true })
      const [call] = linkCalls()
      expect(call.headers.get('authorization')).toBe(`Bearer ${token.accessToken}`)
      expect(call.body).toMatchObject({ nonce: raw, provider: 'apple' })
    })

    it('never links a forged token', async () => {
      const token = await linker()
      const raw = rawNonce()

      expect((await link(token, await forged({ nonce: sha256hex(raw) }), raw)).status).toBe(400)
      expect(linkCalls()).toEqual([])
    })
  })

  describe('reauth/apple', () => {
    /** An account with Apple linked as `sub`, signed in on a live session. */
    async function appleAccount(sub = `apple-${crypto.randomUUID()}`) {
      const created = await confirmedAccount(uniqueEmail('confirmer'))
      await sql.begin(async (tx) => {
        await tx`select set_config('grnyte.auth_user_created', ${created.id}, true)`
        await tx`insert into auth.identities (user_id, provider, provider_id, identity_data)
          values (${created.id}, 'apple', ${sub}, ${tx.json({ email: created.email })})`
      })
      return { ...created, sub, token: await created.session() }
    }
    const appleStart = (token: VerifiedToken, body: Record<string, unknown>, address = freshAddress()) =>
      appCall(reauthStartEndpoint, 'reauth/apple/start', { address, body, locals: bearer(token) })
    const appleConfirm = (token: VerifiedToken, body: Record<string, unknown>) =>
      appCall(reauthConfirmEndpoint, 'reauth/apple/confirm', { body, locals: bearer(token) })
    const grants = (id: string) =>
      sql`select action, method, target from public.reauth_grants where auth_user_fk = ${id}`

    const startRegionDelete = async (token: VerifiedToken) =>
      V1['reauth/apple/start'].response.parse(
        await (await appleStart(token, { action: 'region.delete', target: '1' })).json(),
      )
    /** Refused, and no grant written. */
    async function expectRefused(answer: Response, id: string) {
      expect(answer.status).toBe(400)
      expect(await grants(id)).toEqual([])
    }

    /** A started flow for `body`, then a confirm with a fixture token for `sub` carrying its nonce. */
    async function confirmFlow(
      who: Awaited<ReturnType<typeof appleAccount>>,
      body: Record<string, unknown>,
      extra: Record<string, unknown> = {},
      sub = who.sub,
    ) {
      const { flowId, nonce: digest } = V1['reauth/apple/start'].response.parse(
        await (await appleStart(who.token, body)).json(),
      )
      const idToken = await appleToken({ nonce: digest, sub })
      return { answer: await appleConfirm(who.token, { flowId, idToken, ...extra }), flowId, idToken }
    }

    it('refuses an 11th open start from one client', async () => {
      const { token } = await appleAccount()
      const address = freshAddress()
      for (let i = 0; i < 10; i++) {
        expect((await appleStart(token, { action: 'region.delete', target: '1' }, address)).status).toBe(200)
      }

      expect((await appleStart(token, { action: 'region.delete', target: '1' }, address)).status).toBe(429)
    })

    it.each([
      ['an unknown action', { action: 'region.burn', target: '1' }],
      ['a bound apple:<sub> target for identity.unlink', { action: 'identity.unlink', target: 'apple:123' }],
      ['a provider target outside the list', { action: 'identity.link', target: 'facebook' }],
    ])('issues no nonce for %s', async (_case, body) => {
      const { id, token } = await appleAccount()

      expect((await appleStart(token, body)).status).toBe(400)
      expect(await sql`select 1 from public.app_auth_flows where auth_user_fk = ${id}`).toHaveLength(0)
    })

    it('stores only the nonce digest for a start', async () => {
      const { id, token } = await appleAccount()
      const { nonce } = V1['reauth/apple/start'].response.parse(
        await (await appleStart(token, { action: 'region.delete', target: '1' })).json(),
      )

      const [row] = await sql`select * from public.app_auth_flows where auth_user_fk = ${id}`
      expect(row).toMatchObject({
        code_hash: null,
        nonce_digest: nonce,
        proof: null,
        purpose: 'reauth',
        transaction: null,
      })
    })

    it('writes no grant for a forged token with the linked sub and the issued nonce', async () => {
      const who = await appleAccount()
      const { flowId, nonce } = await startRegionDelete(who.token)

      const answer = await appleConfirm(who.token, { flowId, idToken: await forged({ nonce, sub: who.sub }) })
      await expectRefused(answer, who.id)
    })

    it('records another Apple ID and touches neither the code nor revocation', async () => {
      const who = await appleAccount()
      const { answer } = await confirmFlow(
        who,
        { action: 'account.delete', target: 'self' },
        { authorizationCode: 'code-1' },
        'apple-someone-else',
      )

      await expectRefused(answer, who.id)
      expect(await eventCount('oauth_sub_mismatch')).toBe(1)
      expect(issuer.tokenRequests).toEqual([])
      expect(issuer.revocations).toEqual([])
    })

    it('grants the started action and target, whatever the confirm sends', async () => {
      const who = await appleAccount()
      const { answer } = await confirmFlow(
        who,
        { action: 'region.delete', target: '1' },
        { action: 'region.delete', target: '2' },
      )

      expect(await answer.json()).toEqual({ confirmed: true })
      expect(await grants(who.id)).toEqual([{ action: 'region.delete', method: 'apple', target: '1' }])
    })

    it('refuses a second confirm of one flow', async () => {
      const who = await appleAccount()
      const { flowId, idToken } = await confirmFlow(who, { action: 'region.delete', target: '1' })
      await sql`delete from public.reauth_grants where auth_user_fk = ${who.id}`

      expect((await appleConfirm(who.token, { flowId, idToken })).status).toBe(400)
      expect(await grants(who.id)).toEqual([])
      expect(await handoffFailed('apple_reauth_mismatch')).toBe(1)
    })

    it('refuses a confirm 6 minutes after its start', async () => {
      const who = await appleAccount()
      const { flowId, nonce } = await startRegionDelete(who.token)
      await sql`update public.app_auth_flows set expires_at = expires_at - interval '6 minutes' where id = ${flowId}`

      const answer = await appleConfirm(who.token, { flowId, idToken: await appleToken({ nonce, sub: who.sub }) })
      await expectRefused(answer, who.id)
    })

    it('writes no grant from another session of the same account', async () => {
      const who = await appleAccount()
      const { flowId, nonce } = await startRegionDelete(who.token)
      const other = await who.session()

      const answer = await appleConfirm(other, { flowId, idToken: await appleToken({ nonce, sub: who.sub }) })
      await expectRefused(answer, who.id)
    })

    it("revokes an account deletion through the app's own code under the bundle ID, and records it", async () => {
      const who = await appleAccount()
      issuer.issue({ sub: who.sub })
      const { answer } = await confirmFlow(
        who,
        { action: 'account.delete', target: 'self' },
        { authorizationCode: 'code-1' },
      )

      expect(await answer.json()).toEqual({ confirmed: true })
      expect(issuer.tokenRequests.map(({ body }) => body.get('client_id'))).toEqual([APP_AUD])
      expect(issuer.revocations.map((body) => body.get('client_id'))).toEqual([APP_AUD])
      expect(recorded).toHaveBeenCalledWith('apple_revoked', {
        authUserId: who.id,
        detail: { action: 'account.delete', provider: 'apple', target: who.id },
      })
    })

    it("revokes nothing for an attacker's own code, and records the mismatch", async () => {
      const who = await appleAccount()
      issuer.issue({ sub: 'apple-attacker' })
      const { answer } = await confirmFlow(
        who,
        { action: 'account.delete', target: 'self' },
        { authorizationCode: 'theirs' },
      )

      expect(answer.status).toBe(200)
      expect(issuer.revocations).toEqual([])
      expect(await eventCount('apple_revoked')).toBe(0)
      expect(await handoffFailed('apple_code_mismatch')).toBe(1)
    })

    describe("Apple's notification after grnyte's own revocation", () => {
      /** The real event log for this test: the handler reads grnyte's own revocation from it. */
      beforeEach(async () => {
        const actual = await vi.importActual<typeof import('$lib/auth/server/events.server')>(
          '$lib/auth/server/events.server',
        )
        recorded.mockImplementation(actual.recordAuthEvent)
      })

      const outcome = async (id: string) =>
        (
          await sql<{ outcome: string }[]>`
            select detail->>'outcome' as outcome from public.auth_events
            where auth_user_fk = ${id} and kind = 'apple_notification'`
        ).map((row) => row.outcome)

      const postRevocation = async (sub: string, type: string) => {
        const now = Math.floor(Date.now() / 1000)
        const payload = await signWithIssuerKey({
          aud: PROVIDER_ENV.APPLE_SERVICES_ID,
          events: JSON.stringify({ event_time: now + 1, sub, type }),
          iat: now,
          iss: 'https://appleid.apple.com',
        })
        const request = new Request('https://grnyte.example/api/webhooks/apple/sign-in', {
          body: JSON.stringify({ payload }),
          method: 'POST',
        })
        return (await appleNotification({ request } as never)).status
      }

      it.each([
        ['answered', 200],
        ['refused, or its answer lost', 400],
      ])('changes nothing when Apple sends consent-revoked once grnyte started removing Apple (%s)', async (_c, at) => {
        const who = await appleAccount()
        issuer.issue({ sub: who.sub })
        issuer.revoke.answer = () => at
        await confirmFlow(who, { action: 'identity.unlink', target: 'apple' }, { authorizationCode: 'code-1' })

        expect(await postRevocation(who.sub, 'consent-revoked')).toBe(200)

        expect(await outcome(who.id)).toEqual(['own_revocation'])
      })

      it('changes nothing when Apple sends account-deleted once grnyte started revoking for a deletion', async () => {
        const who = await appleAccount()
        issuer.issue({ sub: who.sub })
        await confirmFlow(who, { action: 'account.delete', target: 'self' }, { authorizationCode: 'code-1' })

        expect(await postRevocation(who.sub, 'account-deleted')).toBe(200)

        expect(await outcome(who.id)).toEqual(['own_revocation'])
      })
    })

    it('records a failed revocation and still grants', async () => {
      const who = await appleAccount()
      issuer.issue({ sub: who.sub })
      issuer.revoke.answer = () => 400
      const { answer } = await confirmFlow(
        who,
        { action: 'account.delete', target: 'self' },
        { authorizationCode: 'code-1' },
      )

      expect(answer.status).toBe(200)
      expect(await eventCount('apple_revoke_failed')).toBe(1)
      expect(await grants(who.id)).toEqual([{ action: 'account.delete', method: 'apple', target: who.id }])
    })
  })
})
