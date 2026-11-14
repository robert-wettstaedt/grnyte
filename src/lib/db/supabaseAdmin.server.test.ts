/** A new secret key goes out only as `apikey`, never as a Bearer; a legacy JWT key keeps its Bearer. */
import { afterEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'sb_secret_test'
const LEGACY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.legacy'

async function load(key: string) {
  vi.resetModules()
  vi.doMock('$env/static/private', async (original) => ({ ...(await original()), SUPABASE_SECRET_KEY: key }))
  vi.doMock('$env/static/public', async (original) => ({
    ...(await original()),
    PUBLIC_SUPABASE_URL: 'http://supabase.test',
  }))
  return import('./supabaseAdmin.server')
}

/** Stubs the base fetch and returns the headers of every request that reached it. */
function spyBaseFetch(): Headers[] {
  const seen: Headers[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    seen.push(new Headers(init?.headers))
    return Response.json({})
  })
  return seen
}

afterEach(() => vi.restoreAllMocks())

describe('supabaseAdmin with a new secret key', () => {
  it('sends an admin and a Storage call with the key as apikey and no Authorization', async () => {
    const seen = spyBaseFetch()
    const { supabaseAdmin } = await load(SECRET)

    await supabaseAdmin().auth.admin.deleteUser('00000000-0000-4000-8000-000000000001')
    await supabaseAdmin().storage.from('staging').list()

    expect(seen).toHaveLength(2)
    for (const headers of seen) {
      expect(headers.get('apikey')).toBe(SECRET)
      expect(headers.has('authorization')).toBe(false)
    }
  })
})

describe('supabaseAdmin with a legacy JWT key', () => {
  it('keeps the Bearer the legacy gateway needs', async () => {
    const seen = spyBaseFetch()
    const { supabaseAdmin } = await load(LEGACY)

    await supabaseAdmin().auth.admin.deleteUser('00000000-0000-4000-8000-000000000001')
    await supabaseAdmin().storage.from('staging').list()

    expect(seen).toHaveLength(2)
    for (const headers of seen) {
      expect(headers.get('authorization')).toBe(`Bearer ${LEGACY}`)
    }
  })
})

describe('secretKeyFetch', () => {
  it('strips the secret Bearer from a Headers instance and from a plain object, in any case', async () => {
    const seen = spyBaseFetch()
    const { secretKeyFetch } = await load(SECRET)

    await secretKeyFetch('http://supabase.test/a', { headers: new Headers({ Authorization: `Bearer ${SECRET}` }) })
    await secretKeyFetch('http://supabase.test/b', { headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` } })

    expect(seen.map((headers) => headers.has('authorization'))).toEqual([false, false])
    expect(seen[1].get('apikey')).toBe(SECRET)
  })

  it("passes a person's own Bearer through", async () => {
    const seen = spyBaseFetch()
    const { secretKeyFetch } = await load(SECRET)

    await secretKeyFetch('http://supabase.test/user', { headers: { Authorization: 'Bearer a.person.token' } })

    expect(seen[0].get('authorization')).toBe('Bearer a.person.token')
  })
})
