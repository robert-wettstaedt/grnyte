import { RATE_LIMIT, rateLimit } from '$lib/hooks/rate-limit.server'
import type { RequestEvent } from '@sveltejs/kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The limiter keeps its counters in a module-level object that nothing resets, and importing it
 * twice in one vitest process gives you the same one. So every test here owns a private IP: the
 * suite used to share `127.0.0.1` across the first three cases and `1.1.1.1` across two more, and
 * each of those only passed because a later case advanced the clock far enough to reset the
 * counter the earlier one had already spent. That is a pass by arrangement, and it moves the
 * moment anybody reorders, renames or adds a case.
 */
describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  const mockEvent = (ip: string, pathname = '/'): RequestEvent =>
    ({
      getClientAddress: () => ip,
      setHeaders: vi.fn(),
      url: new URL(`https://grnyte.rocks${pathname}`),
    }) as unknown as RequestEvent

  const mockResolve = vi.fn().mockResolvedValue(new Response('OK'))

  it('lets a request through and reports the budget it spent', async () => {
    const event = mockEvent('10.0.0.1')
    const response = await rateLimit({ event, resolve: mockResolve })

    expect(response.status).toBe(200)
    expect(event.setHeaders).toHaveBeenCalledWith({
      'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
      'X-RateLimit-Remaining': (RATE_LIMIT.max - 1).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  it('refuses the request past the limit, with a Retry-After', async () => {
    const event = mockEvent('10.0.0.2')
    const requests = Array(RATE_LIMIT.max + 1)
      .fill(null)
      .map(() => rateLimit({ event, resolve: mockResolve }))

    const responses = await Promise.all(requests)

    // Exactly one refusal: the limit is a ceiling, not an off-by-one.
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1)
    expect(responses[responses.length - 1].status).toBe(429)
    expect(responses[responses.length - 1].headers.get('Retry-After')).toBeDefined()
  })

  it('starts the budget over once the window has passed', async () => {
    const event = mockEvent('10.0.0.3')

    await Promise.all(
      Array(RATE_LIMIT.max)
        .fill(null)
        .map(() => rateLimit({ event, resolve: mockResolve })),
    )

    // Spent, and the next one would be refused.
    expect((await rateLimit({ event, resolve: mockResolve })).status).toBe(429)

    vi.advanceTimersByTime(RATE_LIMIT.windowMs + 1)

    const response = await rateLimit({ event, resolve: mockResolve })
    expect(response.status).toBe(200)
    // A fresh budget, not a resumed one.
    expect(event.setHeaders).toHaveBeenLastCalledWith({
      'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
      'X-RateLimit-Remaining': (RATE_LIMIT.max - 1).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  it('counts each address separately, so one heavy caller cannot lock everyone out', async () => {
    const spender = mockEvent('10.0.0.4')
    const bystander = mockEvent('10.0.0.5')

    await Promise.all(
      Array(RATE_LIMIT.max + 1)
        .fill(null)
        .map(() => rateLimit({ event: spender, resolve: mockResolve })),
    )

    const response = await rateLimit({ event: bystander, resolve: mockResolve })

    expect(response.status).toBe(200)
    expect(bystander.setHeaders).toHaveBeenLastCalledWith({
      'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
      'X-RateLimit-Remaining': (RATE_LIMIT.max - 1).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  it('counts down the remaining budget as the requests are spent', async () => {
    const event = mockEvent('10.0.0.6')
    const requestsToMake = Math.floor(RATE_LIMIT.max / 2)

    for (let index = 0; index < requestsToMake; index++) {
      await rateLimit({ event, resolve: mockResolve })
    }

    expect(event.setHeaders).toHaveBeenLastCalledWith({
      'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
      'X-RateLimit-Remaining': (RATE_LIMIT.max - requestsToMake).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  it('does not budget the zero-cache callbacks, and still budgets the paths beside them', async () => {
    // Both halves share one address on purpose, which is the point rather than an oversight: it is
    // what proves the exempt requests did not quietly spend the budget the second half then reads.
    const zero = mockEvent('10.0.0.7', '/api/zero/get-queries')

    const responses = await Promise.all(
      Array(RATE_LIMIT.max + 1)
        .fill(null)
        .map(() => rateLimit({ event: zero, resolve: mockResolve })),
    )

    // Never refused and never counted. Every user's query transformation arrives from zero-cache's
    // one egress address, and zero-cache retries only 5xx, so a single 429 here is a hard
    // TransformFailed for everybody behind it rather than a backoff.
    expect(responses.filter((response) => response.status === 429)).toHaveLength(0)
    expect(zero.setHeaders).not.toHaveBeenCalled()

    // The exemption is that one prefix, not `/api/`. Its neighbours are called by browsers and by
    // cron, and they stay ordinary traffic.
    const task = mockEvent('10.0.0.7', '/api/tasks/notifications')
    await rateLimit({ event: task, resolve: mockResolve })

    expect(task.setHeaders).toHaveBeenCalledWith({
      'X-RateLimit-Limit': RATE_LIMIT.max.toString(),
      'X-RateLimit-Remaining': (RATE_LIMIT.max - 1).toString(),
      'X-RateLimit-Reset': expect.any(String),
    })
  })

  // There is deliberately no test for the sweep that deletes expired keys from `store`.
  //
  // It is a memory guard, not a behaviour: the per-IP branch right below it resets an expired
  // entry to zero whether or not the sweep already removed it, so deleting the sweep entirely
  // changes no response, no header and no status. The case that used to sit here ("should clean
  // up expired rate limit entries") advanced the clock and then asserted two 200s and a
  // `max - 1` header, all of which the case above already covers, so it tested the reset it
  // shared a window with rather than the cleanup in its name. Pinning the real thing would mean
  // exporting `store` purely for the test, which buys less than it costs.
})
