/** The auth-only client: the secret key only as `apikey`, the caller's address as GoTrue sees it, no `admin`. */
import type { VerifiedToken } from '$lib/auth'
import { LEGACY, SECRET, spyBaseFetch, withSecretKey } from '$lib/db/secretKey.fixture'
import type { RequestEvent } from '@sveltejs/kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

const load = (key: string) => withSecretKey(key, () => import('./authServer.server'))

/** A request whose own forwarding headers are forged; only `getClientAddress` may be trusted. */
function eventFrom(address: string) {
  return {
    getClientAddress: () => address,
    request: new Request('http://grnyte.test/auth/signup', {
      headers: { 'sb-forwarded-for': '203.0.113.9', 'x-forwarded-for': '203.0.113.1' },
    }),
  } as unknown as RequestEvent
}

const resend = { email: 'climber@example.com', type: 'signup' } as const

type Client = Awaited<ReturnType<typeof load>> extends { supabaseAuthServer: (e: RequestEvent) => infer C } ? C : never
const CALLS: [string, (client: Client) => Promise<unknown>][] = [
  ['refreshSession', (client) => client.refreshSession({ refresh_token: 'refresh-1' })],
  ['resend', (client) => client.resend(resend)],
  ['resetPasswordForEmail', (client) => client.resetPasswordForEmail('climber@example.com')],
  ['signInWithIdToken', (client) => client.signInWithIdToken({ nonce: 'raw', provider: 'google', token: 'id.token' })],
  ['signInWithPassword', (client) => client.signInWithPassword({ email: 'climber@example.com', password: 'pw' })],
  ['verifyOtp', (client) => client.verifyOtp({ email: 'climber@example.com', token: '12345678', type: 'email' })],
]

afterEach(() => vi.restoreAllMocks())

describe('supabaseAuthServer', () => {
  it('keeps the Bearer a legacy JWT key needs', async () => {
    const seen = spyBaseFetch()
    const { supabaseAuthServer } = await load(LEGACY)

    await supabaseAuthServer(eventFrom('198.51.100.7')).resend(resend)

    expect(seen[0].get('authorization')).toBe(`Bearer ${LEGACY}`)
  })

  it('builds a client per call, so each request forwards its own address', async () => {
    const seen = spyBaseFetch()
    const { supabaseAuthServer } = await load(SECRET)

    await supabaseAuthServer(eventFrom('198.51.100.7')).resend(resend)
    await supabaseAuthServer(eventFrom('198.51.100.8')).resend(resend)

    expect(seen.map((headers) => headers.get('sb-forwarded-for'))).toEqual(['198.51.100.7', '198.51.100.8'])
  })

  it.each(CALLS)('sends %s with the secret key as apikey and the forwarded address', async (_name, call) => {
    const seen = spyBaseFetch()
    const { supabaseAuthServer } = await load(SECRET)

    await call(supabaseAuthServer(eventFrom('198.51.100.7')))

    expect(seen).toHaveLength(1)
    expect(seen[0].get('apikey')).toBe(SECRET)
    expect(seen[0].has('authorization')).toBe(false)
    expect(seen[0].get('sb-forwarded-for')).toBe('198.51.100.7')
  })

  it('never exposes the admin API', async () => {
    const { supabaseAuthServer } = await load(SECRET)
    const client = supabaseAuthServer(eventFrom('198.51.100.7'))

    for (const reachable of ['admin', 'mfa', 'from', 'storage']) {
      expect(reachable in client).toBe(false)
    }
    expect(Object.isFrozen(client)).toBe(true)
    // @ts-expect-error the admin API is not part of the type either
    expect(client.admin).toBeUndefined()
  })
})

function spyRequests() {
  const seen: { headers: Headers; method: string; url: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    seen.push({ headers: new Headers(init?.headers), method: init?.method ?? 'GET', url: String(input) })
    return Response.json({ id: 'auth-user-1' })
  })
  return seen
}

/** A token as `verifyAccessToken` would hand it over; the signature is never checked on this side. */
function verified(sub: string, exp = Math.floor(Date.now() / 1000) + 3600, claims = { session_id: 'session-1', sub }) {
  const payload = Buffer.from(JSON.stringify({ exp, session_id: 'session-1', sub })).toString('base64url')
  return { accessToken: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`, claims } as unknown as VerifiedToken
}

describe('supabaseAuthServerAs', () => {
  it('sends updateUser as the person: their Bearer, the secret key as apikey, the forwarded address', async () => {
    const seen = spyRequests()
    const { supabaseAuthServerAs } = await load(SECRET)
    const token = verified('auth-user-1')

    const { error } = await supabaseAuthServerAs(eventFrom('198.51.100.7'), token).updateUser({
      email: 'new@example.com',
    })

    expect(error).toBeNull()
    expect(seen.map(({ method, url }) => `${method} ${new URL(url).pathname}`)).toEqual(['PUT /auth/v1/user'])
    expect(seen[0].headers.get('authorization')).toBe(`Bearer ${token.accessToken}`)
    expect(seen[0].headers.get('apikey')).toBe(SECRET)
    expect(seen[0].headers.get('sb-forwarded-for')).toBe('198.51.100.7')
  })

  it('goes through with a token 30 s from expiry, which auth-js would otherwise try to refresh', async () => {
    const seen = spyRequests()
    const { supabaseAuthServerAs } = await load(SECRET)
    const token = verified('auth-user-1', Math.floor(Date.now() / 1000) + 30)

    const { error } = await supabaseAuthServerAs(eventFrom('198.51.100.7'), token).updateUser({
      email: 'new@example.com',
    })

    expect(error).toBeNull()
    expect(seen.map(({ method }) => method)).toEqual(['PUT'])
  })

  it('keeps each call to its own session', async () => {
    const seen = spyRequests()
    const { supabaseAuthServerAs } = await load(SECRET)
    const first = verified('auth-user-1')
    const second = verified('auth-user-2')

    await supabaseAuthServerAs(eventFrom('198.51.100.7'), first).updateUser({ email: 'a@example.com' })
    await supabaseAuthServerAs(eventFrom('198.51.100.7'), second).updateUser({ email: 'b@example.com' })

    expect(seen.map(({ headers }) => headers.get('authorization'))).toEqual([
      `Bearer ${first.accessToken}`,
      `Bearer ${second.accessToken}`,
    ])
  })

  it('refuses a token whose sub or session differs from the claims beside it', async () => {
    const { supabaseAuthServerAs } = await load(SECRET)
    const otherSub = verified('auth-user-1', undefined, { session_id: 'session-1', sub: 'auth-user-2' })
    const otherSession = verified('auth-user-1', undefined, { session_id: 'session-2', sub: 'auth-user-1' })

    expect(() => supabaseAuthServerAs(eventFrom('198.51.100.7'), otherSub)).toThrow()
    expect(() => supabaseAuthServerAs(eventFrom('198.51.100.7'), otherSession)).toThrow()
  })

  it('exposes only the calls that act as a person', async () => {
    const { supabaseAuthServerAs } = await load(SECRET)
    const client = supabaseAuthServerAs(eventFrom('198.51.100.7'), verified('auth-user-1'))

    expect(Object.keys(client).sort()).toEqual([
      'getUserIdentities',
      'linkIdentity',
      'signOut',
      'unlinkIdentity',
      'updateUser',
    ])
    for (const reachable of ['admin', 'from']) {
      expect(reachable in client).toBe(false)
    }
    expect(Object.isFrozen(client)).toBe(true)
  })
})
