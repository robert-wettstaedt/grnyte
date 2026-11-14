/** The auth-only client: the secret key only as `apikey`, the caller's address as GoTrue sees it, one method. */
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

afterEach(() => vi.restoreAllMocks())

describe('supabaseAuthServer', () => {
  it("sends the secret key as apikey only, with the caller's address from the platform", async () => {
    const seen = spyBaseFetch()
    const { supabaseAuthServer } = await load(SECRET)

    await supabaseAuthServer(eventFrom('198.51.100.7')).resend(resend)

    expect(seen).toHaveLength(1)
    expect(seen[0].get('apikey')).toBe(SECRET)
    expect(seen[0].has('authorization')).toBe(false)
    expect(seen[0].get('sb-forwarded-for')).toBe('198.51.100.7')
  })

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

  it('exposes resend and nothing else', async () => {
    const { supabaseAuthServer } = await load(SECRET)
    const client = supabaseAuthServer(eventFrom('198.51.100.7'))

    expect(Object.keys(client)).toEqual(['resend'])
    for (const reachable of ['admin', 'mfa', 'from', 'storage']) {
      expect(reachable in client).toBe(false)
    }
    expect(Object.isFrozen(client)).toBe(true)
    // @ts-expect-error the admin API is not part of the type either
    expect(client.admin).toBeUndefined()
  })
})
