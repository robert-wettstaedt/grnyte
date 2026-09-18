import { describe, expect, it, vi } from 'vitest'

vi.mock('$env/static/private', () => ({ BUNNY_STREAM_API_KEY: 'test-key' }))
vi.mock('$env/static/public', () => ({ PUBLIC_BUNNY_STREAM_LIBRARY_ID: '383888' }))

const { getBunnyVideoProvider } = await import('./bunny.provider.server')

const provider = getBunnyVideoProvider()

describe('readinessFromWebhook', () => {
  it.each([
    [0, 'pending'], // Queued
    [1, 'pending'], // Processing
    [2, 'pending'], // Encoding
    [3, 'ready'], // Finished
    [4, 'ready'], // ResolutionFinished: playable before the other renditions land
    [5, 'failed'], // Failed
  ])('maps webhook %i to %s', (status, expected) => {
    expect(provider.readinessFromWebhook(status)).toBe(expected)
  })

  // Upload lifecycle, captions and metadata say nothing about playability, and a `pending` here
  // would demote a playable video.
  it.each([6, 7, 8, 9, 10])('ignores webhook %i', (status) => {
    expect(provider.readinessFromWebhook(status)).toBeUndefined()
  })
})

describe('readinessFromApi', () => {
  it.each([
    [0, 'pending'], // Created
    [1, 'pending'], // Uploaded
    [2, 'pending'], // Processing
    [3, 'pending'], // Transcoding
    [4, 'ready'], // Finished
    [5, 'failed'], // Error
    [6, 'failed'], // UploadFailed
  ])('maps api %i to %s', (status, expected) => {
    expect(provider.readinessFromApi(status)).toBe(expected)
  })
})

// The reason there are two mappers. If these agree, one was written from the other's table.
describe('the two enums collide', () => {
  it('disagrees on 3, which is Finished by webhook and Transcoding by api', () => {
    expect(provider.readinessFromWebhook(3)).toBe('ready')
    expect(provider.readinessFromApi(3)).toBe('pending')
  })

  it('disagrees on 5 vs 6 at the failed end, so api 6 has no webhook counterpart', () => {
    expect(provider.readinessFromWebhook(6)).toBeUndefined()
    expect(provider.readinessFromApi(6)).toBe('failed')
  })

  it('agrees on 4 only by coincidence, from different meanings', () => {
    // Webhook 4 is ResolutionFinished and api 4 is Finished: same answer, different questions.
    expect(provider.readinessFromWebhook(4)).toBe('ready')
    expect(provider.readinessFromApi(4)).toBe('ready')
  })
})
