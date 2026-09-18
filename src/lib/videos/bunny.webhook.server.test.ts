import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

const SECRET = 'read-only-key'

vi.mock('$env/static/private', () => ({ BUNNY_STREAM_API_KEY: 'full-key', BUNNY_STREAM_READ_ONLY_KEY: SECRET }))
vi.mock('$env/static/public', () => ({ PUBLIC_BUNNY_STREAM_LIBRARY_ID: '383888' }))

const { getBunnyVideoProvider } = await import('./bunny.provider.server')

const provider = getBunnyVideoProvider()
const body = JSON.stringify({ Status: 3, VideoGuid: '6b58da3f-992b-4e5e-9619-63334f0e50b7', VideoLibraryId: 383888 })
const sign = (raw: string, key = SECRET) => createHmac('sha256', key).update(raw, 'utf8').digest('hex')

const headers = (overrides: Record<string, null | string> = {}) => {
  const base: Record<string, string> = {
    'X-BunnyStream-Signature': sign(body),
    'X-BunnyStream-Signature-Algorithm': 'hmac-sha256',
    'X-BunnyStream-Signature-Version': 'v1',
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete base[key]
    else base[key] = value
  }
  return new Headers(base)
}

describe('verifyWebhook', () => {
  it('accepts a correctly signed body', () => {
    expect(provider.verifyWebhook(body, headers())).toBe(true)
  })

  it('rejects a tampered body, because the signature covers the exact bytes', () => {
    const tampered = body.replace('"Status":3', '"Status":5')
    expect(provider.verifyWebhook(tampered, headers())).toBe(false)
  })

  // The same JSON value in different bytes, which is why the route must hash the raw body.
  it('rejects a re-serialised body whose value is unchanged', () => {
    const reserialised = JSON.stringify(JSON.parse(body.replace('{', '{ ')))
    expect(provider.verifyWebhook(`${reserialised} `, headers())).toBe(false)
  })

  it('rejects a signature made with a different key', () => {
    expect(provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature': sign(body, 'wrong-key') }))).toBe(false)
  })

  it('rejects a missing signature header', () => {
    expect(provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature': null }))).toBe(false)
  })

  it('rejects an unexpected signature version', () => {
    expect(provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature-Version': 'v2' }))).toBe(false)
  })

  it('rejects an unexpected algorithm', () => {
    expect(provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature-Algorithm': 'hmac-sha1' }))).toBe(false)
  })

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on unequal lengths, so the length guard must catch this first.
    expect(() => provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature': 'abc123' }))).not.toThrow()
    expect(provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature': 'abc123' }))).toBe(false)
  })

  // Kit resolves a missing private env member to undefined in dev, so an unset secret must deny.
  it('denies rather than throwing when the secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$env/static/private', () => ({
      BUNNY_STREAM_API_KEY: 'full-key',
      BUNNY_STREAM_READ_ONLY_KEY: undefined,
    }))
    const { getBunnyVideoProvider: fresh } = await import('./bunny.provider.server')
    const unset = fresh()
    expect(() => unset.verifyWebhook(body, headers())).not.toThrow()
    expect(unset.verifyWebhook(body, headers())).toBe(false)
    vi.doUnmock('$env/static/private')
    vi.resetModules()
  })

  it('accepts an uppercase hex signature', () => {
    expect(provider.verifyWebhook(body, headers({ 'X-BunnyStream-Signature': sign(body).toUpperCase() }))).toBe(true)
  })
})
