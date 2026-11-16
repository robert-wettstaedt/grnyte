import { afterEach, describe, expect, it, vi } from 'vitest'
import { seal, unseal } from './seal.server'

const INFO = 'grnyte oauth transaction v1'
const VALUE = { nonce: 'n', state: 's' }

afterEach(() => {
  vi.doUnmock('$env/static/private')
})

describe('seal', () => {
  it('round-trips a value', async () => {
    expect(await unseal(INFO, await seal(INFO, VALUE))).toEqual(VALUE)
  })

  it('answers null for a flipped byte', async () => {
    const sealed = await seal(INFO, VALUE)
    const at = sealed.lastIndexOf('.') - 3
    const flipped = sealed.slice(0, at) + (sealed[at] === 'A' ? 'B' : 'A') + sealed.slice(at + 1)

    expect(await unseal(INFO, flipped)).toBeNull()
  })

  it('answers null under another info', async () => {
    expect(await unseal('another purpose', await seal(INFO, VALUE))).toBeNull()
  })

  it('answers null under another secret', async () => {
    const sealed = await seal(INFO, VALUE)
    vi.resetModules()
    vi.doMock('$env/static/private', async (actual) => ({ ...(await actual()), SUPABASE_SECRET_KEY: 'another secret' }))
    const other = await import('./seal.server')

    expect(await other.unseal(INFO, sealed)).toBeNull()
  })
})
