import type { RequestEvent } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = vi.fn(() => Promise.resolve())
const insert = vi.fn(() => ({ values }))

vi.mock('$lib/db/db.server', () => ({ db: { insert } }))
// Pulled in by the `handle` sequence, irrelevant here and expensive to load for real.
vi.mock('$lib/hooks/auth.server', () => ({ authGuard: vi.fn(), supabase: vi.fn() }))
vi.mock('$lib/hooks/paraglide.server', () => ({ handle: vi.fn() }))

const { handleError } = await import('./hooks.server')

const event = (pathname = '/routes/1') =>
  ({ locals: { user: { id: 7 } }, url: new URL(`https://grnyte.rocks${pathname}`) }) as unknown as RequestEvent

describe('handleError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('persists unexpected errors', async () => {
    const result = await handleError({ error: new Error('boom'), event: event(), message: '', status: 500 })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: 7,
        error: expect.stringContaining('boom'),
        pathname: '/routes/1',
        source: 'server',
      }),
    )
    expect(result).toEqual({ message: 'Something went wrong' })
  })

  it('ignores missing routes', async () => {
    await handleError({ error: new Error('Not found'), event: event('/nope'), message: '', status: 404 })

    expect(insert).not.toHaveBeenCalled()
  })

  it('never lets a failing write mask the error it reports', async () => {
    values.mockReturnValueOnce(Promise.reject(new Error('db is down')))

    await expect(handleError({ error: new Error('boom'), event: event(), message: '', status: 500 })).resolves.toEqual({
      message: 'Something went wrong',
    })
  })
})
