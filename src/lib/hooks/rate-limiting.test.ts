import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit } from '$lib/hooks/rate-limit'
import { config } from '$lib/config'
import type { RequestEvent } from '@sveltejs/kit'

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  const mockEvent = (ip: string = '127.0.0.1'): RequestEvent =>
    ({
      getClientAddress: () => ip,
      setHeaders: vi.fn(),
    }) as unknown as RequestEvent

  const mockResolve = vi.fn().mockResolvedValue(new Response('OK'))

  it('should allow requests within rate limit', async () => {
    const event = mockEvent()
    const response = await rateLimit({ event, resolve: mockResolve })

    expect(response.status).toBe(200)
    expect(event.setHeaders).toHaveBeenCalledWith({
      'X-RateLimit-Limit': config.api.rateLimit.max.toString(),
      'X-RateLimit-Remaining': (config.api.rateLimit.max - 1).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  it('should block requests exceeding rate limit', async () => {
    const event = mockEvent()
    const requests = Array(config.api.rateLimit.max + 1)
      .fill(null)
      .map(() => rateLimit({ event, resolve: mockResolve }))

    const responses = await Promise.all(requests)
    const blockedResponse = responses[responses.length - 1]

    expect(blockedResponse.status).toBe(429)
    expect(blockedResponse.headers.get('Retry-After')).toBeDefined()
  })

  it('should reset rate limit after window expires', async () => {
    const event = mockEvent()

    // Make max requests
    await Promise.all(
      Array(config.api.rateLimit.max)
        .fill(null)
        .map(() => rateLimit({ event, resolve: mockResolve })),
    )

    // Advance time past the window
    vi.advanceTimersByTime(config.api.rateLimit.windowMs)

    // Next request should succeed
    const response = await rateLimit({ event, resolve: mockResolve })
    expect(response.status).toBe(200)
  })

  it('should track rate limits separately for different IPs', async () => {
    const event1 = mockEvent('1.1.1.1')
    const event2 = mockEvent('2.2.2.2')

    // Max out first IP
    await Promise.all(
      Array(config.api.rateLimit.max)
        .fill(null)
        .map(() => rateLimit({ event: event1, resolve: mockResolve })),
    )

    // Second IP should still be allowed
    const response = await rateLimit({ event: event2, resolve: mockResolve })
    expect(response.status).toBe(200)
  })

  it('should clean up expired rate limit entries', async () => {
    const event1 = mockEvent('1.1.1.1')
    const event2 = mockEvent('2.2.2.2')

    // Make requests from both IPs
    await rateLimit({ event: event1, resolve: mockResolve })
    await rateLimit({ event: event2, resolve: mockResolve })

    // Advance time past the window
    vi.advanceTimersByTime(config.api.rateLimit.windowMs + 1)

    // Make a new request to trigger cleanup
    await rateLimit({ event: mockEvent('3.3.3.3'), resolve: mockResolve })

    // Make new requests from original IPs
    const response1 = await rateLimit({ event: event1, resolve: mockResolve })
    const response2 = await rateLimit({ event: event2, resolve: mockResolve })

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(event1.setHeaders).toHaveBeenCalledWith({
      'X-RateLimit-Limit': config.api.rateLimit.max.toString(),
      'X-RateLimit-Remaining': (config.api.rateLimit.max - 1).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  it('should set correct headers for remaining requests', async () => {
    const event = mockEvent('1.1.1.1.')
    const requestsToMake = Math.floor(config.api.rateLimit.max / 2)

    for (let i = 0; i < requestsToMake; i++) {
      await rateLimit({ event, resolve: mockResolve })
    }

    expect(event.setHeaders).toHaveBeenLastCalledWith({
      'X-RateLimit-Limit': config.api.rateLimit.max.toString(),
      'X-RateLimit-Remaining': (config.api.rateLimit.max - requestsToMake).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })
})
