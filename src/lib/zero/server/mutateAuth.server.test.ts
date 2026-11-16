/** Every refused caller gets 401: Zero's `needs-auth` keeps queued writes, the `error` state a 502 ends in drops them. */
import { isHttpError } from '@sveltejs/kit'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server', () => ({ db: {} }))
const zeroCaller = vi.fn()
vi.mock('./caller.server', () => ({ zeroCaller }))

const { handleMutate } = await import('./mutate.server')

async function statusFor(reason: string): Promise<number | undefined> {
  zeroCaller.mockResolvedValue({ ok: false, reason })
  try {
    await handleMutate(new Request('http://localhost/api/zero/mutate', { method: 'POST' }))
  } catch (thrown) {
    if (isHttpError(thrown)) return thrown.status
    throw thrown
  }
  return undefined
}

describe('handleMutate refusals', () => {
  it('answers 401 while the signing keys cannot be fetched, so queued writes survive', async () => {
    expect(await statusFor('unavailable')).toBe(401)
  })

  it('answers 401 for an expired and for a forged token alike', async () => {
    expect(await statusFor('expired')).toBe(401)
    expect(await statusFor('invalid')).toBe(401)
  })
})
