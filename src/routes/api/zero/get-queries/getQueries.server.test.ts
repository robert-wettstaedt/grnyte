/** zero-cache retries only 502 and 504, so the answers here decide whether sync recovers or dies. */
import { isHttpError } from '@sveltejs/kit'
import { describe, expect, it, vi } from 'vitest'

const zeroCaller = vi.fn()
vi.mock('$lib/zero/caller.server', () => ({ zeroCaller }))

const { POST } = await import('./+server')

async function statusFor(reason: string): Promise<number | undefined> {
  zeroCaller.mockResolvedValue({ ok: false, reason })
  try {
    const request = new Request('http://localhost/api/zero/get-queries', { method: 'POST' })
    await POST({ request } as Parameters<typeof POST>[0])
  } catch (thrown) {
    if (isHttpError(thrown)) return thrown.status
    throw thrown
  }
  return undefined
}

describe('get-queries', () => {
  it('answers 502 while the signing keys cannot be fetched, so zero-cache retries', async () => {
    expect(await statusFor('unavailable')).toBe(502)
  })

  it('answers 502 for an expired token, and 401 for one that is not valid at all', async () => {
    expect(await statusFor('expired')).toBe(502)
    expect(await statusFor('invalid')).toBe(401)
  })
})
