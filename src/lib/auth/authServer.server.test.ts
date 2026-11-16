/** The auth-only client: the secret key only as `apikey`, the caller's address as GoTrue sees it, no `admin`. */
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
  ['resend', (client) => client.resend(resend)],
  ['resetPasswordForEmail', (client) => client.resetPasswordForEmail('climber@example.com')],
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
