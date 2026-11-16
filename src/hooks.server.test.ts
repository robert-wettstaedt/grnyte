import type { Handle, RequestEvent } from '@sveltejs/kit'
import { with_request_store } from '@sveltejs/kit/internal/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = vi.fn(() => Promise.resolve())
const insert = vi.fn(() => ({ values }))

// A pass-through double, so these assert what is written and not that a pinned transaction wrote
// it. The pin itself is covered against a real database in `pinned.server.test.ts`.
vi.mock('$lib/db/pinned.server', () => ({
  pinnedTx: async (body: (tx: { insert: typeof insert }) => PromiseLike<unknown>) => body({ insert }),
}))
// Pulled in by the `handle` sequence, expensive to load for real: pass-throughs.
const passThrough = vi.hoisted(
  (): Handle =>
    ({ event, resolve }) =>
      resolve(event),
)
vi.mock('$lib/hooks/auth.server', () => ({
  APP_API_PREFIX: '/api/app/',
  authGuard: passThrough,
  supabase: passThrough,
  ZERO_API_PREFIX: '/api/zero/',
}))
vi.mock('$lib/hooks/paraglide.server', () => ({ handle: passThrough }))

const { handle, handleError } = await import('./hooks.server')

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

  it('ignores wrong methods', async () => {
    const error = new Error('POST method not allowed. No form actions exist for this page')
    await handleError({ error, event: event('/'), message: '', status: 405 })

    expect(insert).not.toHaveBeenCalled()
  })

  it('never lets a failing write mask the error it reports', async () => {
    values.mockReturnValueOnce(Promise.reject(new Error('db is down')))

    await expect(handleError({ error: new Error('boom'), event: event(), message: '', status: 500 })).resolves.toEqual({
      message: 'Something went wrong',
    })
  })
})

describe('handle, cross-site requests', () => {
  let ip = 0
  /** A text/plain request through the whole sequence; `endpoint` stands in for a +server.ts handler. */
  async function send(
    path: string,
    {
      cookie = true,
      method = 'POST',
      page = path,
      site,
    }: { cookie?: boolean; method?: string; page?: string; site?: string } = {},
  ) {
    const headers = new Headers({ 'content-type': 'text/plain' })
    if (site != null) headers.set('sec-fetch-site', site)
    if (cookie) headers.set('cookie', 'theme=dark; sb-127-auth-token.0=base64-abc')
    const request = new Request(`https://grnyte.rocks${path}`, {
      body: method === 'GET' ? undefined : 'x',
      headers,
      method,
    })
    const event = {
      getClientAddress: () => `10.9.0.${(ip += 1)}`,
      locals: {},
      request,
      setHeaders: vi.fn(),
      url: new URL(`https://grnyte.rocks${page}`),
    } as unknown as RequestEvent
    const endpoint = vi.fn(async () => new Response('ran'))
    // `sequence` reads Kit's request store for its tracing spans; an untraced one, as with tracing off.
    const state = { tracing: { record_span: ({ fn }: { fn: (span: object) => unknown }) => fn({}) } }
    const response = await with_request_store({ event, state } as never, () => handle({ event, resolve: endpoint }))
    return { ran: endpoint.mock.calls.length > 0, status: response.status }
  }

  it('refuses a cross-site write carrying the session cookie before the endpoint runs', async () => {
    expect(await send('/api/thing', { site: 'cross-site' })).toEqual({ ran: false, status: 403 })
  })

  it('refuses same-site and none too, since grnyte is single-origin', async () => {
    expect((await send('/api/thing', { site: 'same-site' })).status).toBe(403)
    expect((await send('/api/thing', { site: 'none' })).status).toBe(403)
  })

  it('passes same-origin, a cross-site GET, a cookieless POST and a request without the header', async () => {
    expect(await send('/api/thing', { site: 'same-origin' })).toEqual({ ran: true, status: 200 })
    expect(await send('/api/thing', { method: 'GET', site: 'cross-site' })).toEqual({ ran: true, status: 200 })
    expect(await send('/api/thing', { cookie: false, site: 'cross-site' })).toEqual({ ran: true, status: 200 })
    expect(await send('/api/thing')).toEqual({ ran: true, status: 200 })
  })

  it('passes the exempt Apple callback and the app API', async () => {
    expect(await send('/auth/callback/apple', { site: 'cross-site' })).toEqual({ ran: true, status: 200 })
    expect(await send('/api/app/session', { site: 'cross-site' })).toEqual({ ran: true, status: 200 })
  })

  it('refuses a remote function called from the exempt page, matching the request, not the page', async () => {
    const call = await send('/_app/remote/abc123/confirm', { page: '/auth/callback/apple', site: 'cross-site' })
    expect(call).toEqual({ ran: false, status: 403 })
  })
})
