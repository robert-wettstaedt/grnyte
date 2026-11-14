/** A new secret key goes out only as `apikey`, never as a Bearer; a legacy JWT key keeps its Bearer. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGACY, SECRET, spyBaseFetch, withSecretKey } from './secretKey.fixture'

const load = (key: string) => withSecretKey(key, () => import('./supabaseAdmin.server'))

/** The headers of one admin call and one Storage call made with `key`. */
async function adminAndStorageHeaders(key: string) {
  const seen = spyBaseFetch()
  const { supabaseAdmin } = await load(key)
  await supabaseAdmin().auth.admin.deleteUser('00000000-0000-4000-8000-000000000001')
  await supabaseAdmin().storage.from('staging').list()
  expect(seen).toHaveLength(2)
  return seen
}

afterEach(() => vi.restoreAllMocks())

describe('supabaseAdmin', () => {
  it('sends a new secret key as apikey with no Authorization on admin and Storage calls', async () => {
    for (const headers of await adminAndStorageHeaders(SECRET)) {
      expect(headers.get('apikey')).toBe(SECRET)
      expect(headers.has('authorization')).toBe(false)
    }
  })

  it('keeps the Bearer the legacy gateway needs for a legacy JWT key', async () => {
    for (const headers of await adminAndStorageHeaders(LEGACY)) {
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
