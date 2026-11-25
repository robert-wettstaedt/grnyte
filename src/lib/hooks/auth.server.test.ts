import { APP_HOME_PATH, AUTH_PATH } from '$lib/auth'
import { appError } from '$lib/auth/app/v1'
import { acceptPath, REGION_CREATE_PATH } from '$lib/entities/region/paths'
import { isHttpError, isRedirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { with_request_store } from '@sveltejs/kit/internal/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The module connects to Postgres at import time, and nothing here reaches a query: every session
// this suite drives is stubbed, and the one DB call `authGuard` can make is the invitation lookup
// below.
vi.mock('$lib/db/db.server', () => ({ db: {} }))
vi.mock('$lib/entities/region/invite.server', () => ({ findLiveInvitationByEmail: vi.fn() }))
vi.mock('$lib/auth/server/verify.server', async (actual) => ({ ...(await actual()), verifyAccessToken: vi.fn() }))
const live = vi.hoisted(() => ({ sessions: new Set<string>() }))
vi.mock('$lib/auth/server/session.server', () => ({
  isSessionLive: vi.fn(async (_db: unknown, claims: { session_id?: string }) =>
    live.sessions.has(claims.session_id ?? ''),
  ),
}))
vi.mock('$lib/db/pinned.server', () => ({
  pinnedTx: vi.fn(async () => ({ user: { id: 1 }, userPermissions: undefined, userRegions: [], userRole: undefined })),
}))
vi.mock('$lib/entities/user/provision.server', () => ({ hasDeletionMarker: vi.fn() }))
const getSession = vi.fn()
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ auth: { getSession } })) }))
vi.mock('@supabase/supabase-js', async (actual) => ({ ...(await actual()), createClient: vi.fn(() => ({ auth: {} })) }))

const { findLiveInvitationByEmail } = await import('$lib/entities/region/invite.server')
const { verifyAccessToken } = await import('$lib/auth/server/verify.server')
const { hasDeletionMarker } = await import('$lib/entities/user/provision.server')
const { createServerClient } = await import('@supabase/ssr')
const { authGuard, supabase } = await import('$lib/hooks/auth.server')
const { handle } = await import('../../hooks.server')
const { POST: syncMutate } = await import('../../routes/api/sync/mutate/+server')

const lookup = vi.mocked(findLiveInvitationByEmail)
const verify = vi.mocked(verifyAccessToken)
const marked = vi.mocked(hasDeletionMarker)
const signOut = vi.fn()

interface Session {
  email?: string
  profile?: boolean
  regions?: number
  /** A remote-function call made from the page at `path`. */
  remote?: boolean
  signedIn?: boolean
}

const mockEvent = (
  path: string,
  { email = 'climber@grnyte.rocks', profile = true, regions = 1, remote = false, signedIn = true }: Session = {},
) => {
  const session = {
    backendUnavailable: false,
    claims: signedIn ? { email, sub: 'auth-user-1' } : undefined,
    user: profile ? { id: 1 } : undefined,
    userPermissions: undefined,
    userRegions: Array.from({ length: regions }, (_unused, index) => ({ regionFk: index + 1 })),
    userRole: undefined,
    verifiedToken: signedIn ? { accessToken: 'a.cookie.token' } : undefined,
  }

  return {
    isRemoteRequest: remote,
    locals: { safeGetSession: () => Promise.resolve(session), supabase: { auth: { signOut } } },
    request: new Request(`https://grnyte.rocks${remote ? '/_app/remote/fn' : path}`),
    url: new URL(`https://grnyte.rocks${path}`),
  } as unknown as RequestEvent
}

/** The Location the guard redirects to, or undefined when it lets the request through. */
const redirectFrom = async (event: RequestEvent): Promise<string | undefined> => {
  try {
    await authGuard({ event, resolve: () => Promise.resolve(new Response('OK')) })
  } catch (error) {
    if (isRedirect(error)) {
      return error.location
    }

    throw error
  }

  return undefined
}

describe('safeGetSession', () => {
  /** Runs the real `supabase` handle and returns what its `safeGetSession` resolves for a cookie session. */
  async function sessionFor(verified: 'invalid' | 'unavailable' | object) {
    getSession.mockResolvedValue({ data: { session: { access_token: 'a.cookie.token' } }, error: null })
    verify.mockResolvedValue((typeof verified === 'string' ? { ok: false, reason: verified } : verified) as never)
    const event = {
      cookies: { getAll: () => [], set: vi.fn() },
      locals: {},
      request: new Request('https://grnyte.rocks/explore'),
      setHeaders: vi.fn(),
      url: new URL('https://grnyte.rocks/explore'),
    } as unknown as RequestEvent
    await supabase({ event, resolve: () => Promise.resolve(new Response('OK')) })
    return event.locals.safeGetSession()
  }

  it('reports an outage, not a sign-out, when the signing keys cannot be fetched', async () => {
    expect(await sessionFor('unavailable')).toMatchObject({ backendUnavailable: true, claims: undefined })
  })

  it('treats a forged token as a plain anonymous request', async () => {
    expect(await sessionFor('invalid')).toMatchObject({ backendUnavailable: false, claims: undefined })
    expect((await sessionFor('invalid')).verifiedToken).toBeUndefined()
  })

  it('keeps the verified token beside its claims', async () => {
    const claims = { sub: 'auth-user-1' }
    const token = { accessToken: 'a.cookie.token', claims }

    expect((await sessionFor({ claims, ok: true, token })).verifiedToken).toBe(token)
  })
})

describe('supabase', () => {
  const clientsBuiltFor = async (path: string) => {
    vi.mocked(createServerClient).mockClear()
    const event = {
      locals: {},
      request: new Request(`https://grnyte.rocks${path}`),
      url: new URL(`https://grnyte.rocks${path}`),
    } as unknown as RequestEvent
    await supabase({ event, resolve: () => Promise.resolve(new Response('OK')) })
    return vi.mocked(createServerClient).mock.calls.length
  }

  // Building one starts a session load whose late cookie write crashed the server on an expired cookie.
  it('builds no client for a zero-cache callback', async () => {
    expect(await clientsBuiltFor('/api/zero/get-queries')).toBe(0)
    expect(await clientsBuiltFor('/explore')).toBe(1)
  })

  it('reads no cookie session for a write without a token, which the route refuses', async () => {
    vi.mocked(createServerClient).mockClear()
    getSession.mockResolvedValue({ data: { session: { access_token: 'a.cookie.token' } }, error: null })
    verify.mockImplementation((async (token?: string) =>
      token === 'a.cookie.token'
        ? { claims: { session_id: 's', sub: 'auth-user-1' }, ok: true, token: {} }
        : { ok: false, reason: 'invalid' }) as never)
    const url = 'https://grnyte.rocks/api/sync/mutate'
    const request = new Request(url, {
      body: JSON.stringify({ args: {}, id: 'write-1', name: 'favorites.set' }),
      headers: { cookie: 'sb-grnyte-auth-token=a.cookie.token', 'sec-fetch-site': 'same-origin' },
      method: 'POST',
    })
    const event = {
      cookies: { get: () => undefined, getAll: () => [], set: vi.fn() },
      getClientAddress: () => '127.0.0.1',
      locals: {},
      request,
      setHeaders: vi.fn(),
      url: new URL(url),
    } as unknown as RequestEvent
    // As Kit answers a route that threw `error()`.
    const resolve = async (resolved: RequestEvent) => {
      try {
        return await syncMutate(resolved as never)
      } catch (thrown) {
        if (isHttpError(thrown)) return new Response(null, { status: thrown.status })
        throw thrown
      }
    }

    // `sequence` reads the request store, and opens a span per hook.
    const record_span = ({ fn }: { fn: (span: unknown) => unknown }) => fn({})
    const response = await with_request_store({ event, state: { tracing: { record_span } } } as never, () =>
      handle({ event, resolve: resolve as never }),
    )

    expect(response.status).toBe(401)
    expect(createServerClient).not.toHaveBeenCalled()
  })

  // An app return carries the browser's web cookies: only the web carrier may load that session.
  it('builds no cookie client on an OAuth callback before a carrier reads it', async () => {
    expect(await clientsBuiltFor('/auth/callback/google?state=s')).toBe(0)
  })
})

describe('authGuard', () => {
  beforeEach(() => {
    lookup.mockReset()
    lookup.mockResolvedValue(undefined)
    marked.mockReset()
    marked.mockResolvedValue(false)
    signOut.mockReset()
  })

  it('serves a page load on the cookie claims alone, never checking the session is live', async () => {
    expect(await redirectFrom(mockEvent('/settings'))).toBeUndefined()
    expect(signOut).not.toHaveBeenCalled()
  })

  describe('a signed-in visitor to an auth page', () => {
    it('goes to the app, not to the landing page it just pressed "sign in" on', async () => {
      expect(await redirectFrom(mockEvent('/auth/signin'))).toBe(APP_HOME_PATH)
    })

    it("keeps a `next`, so the invitation mail's sign-in link does not strand the token", async () => {
      expect(await redirectFrom(mockEvent('/auth/signin?next=%2Finvite%2Faccept%3Ftoken%3Dx'))).toBe(
        '/auth/continue?next=%2Finvite%2Faccept%3Ftoken%3Dx',
      )
    })

    // Not bounced off /auth: the bounce goes through the same helper, which ends here again.
    it.each([true, false])('is left alone on /auth/continue (profile: %s)', async (profile) => {
      expect(await redirectFrom(mockEvent('/auth/continue?next=%2Froutes%2F1', { profile }))).toBeUndefined()
    })

    it('refuses a `next` pointing back into /auth, which would bounce straight back here', async () => {
      expect(await redirectFrom(mockEvent('/auth/signin?next=%2Fauth%2Fsignup'))).toBe(APP_HOME_PATH)
    })

    // The URL parser strips these before any check can see them, so an unrefused one survives as a
    // garbage path: asserted as the fallback, not merely as "no control characters left".
    it.each(['%0D%0AX-Injected:%201', '%0AX-Injected:%201'])(
      'falls back rather than carrying %s through',
      async (suffix) => {
        expect(await redirectFrom(mockEvent(`/auth/signin?next=%2Fexplore${suffix}`))).toBe(APP_HOME_PATH)
      },
    )

    it('falls back on a `next` the guard would treat as inside /auth, rather than handing it back', async () => {
      expect(await redirectFrom(mockEvent('/auth/signin?next=%2Fauthx'))).toBe(APP_HOME_PATH)
    })

    it('refuses an off-origin `next`', async () => {
      expect(await redirectFrom(mockEvent('/auth/signin?next=%2F%5Cevil.com'))).toBe(APP_HOME_PATH)
    })

    it('is left alone on an emailed-link page, whose token would be dropped by a bounce', async () => {
      expect(await redirectFrom(mockEvent('/auth/confirm'))).toBeUndefined()
    })

    it.each([true, false])(
      'is left alone on an OAuth callback (profile: %s), whose session no hook loads',
      async (profile) => {
        const event = mockEvent('/auth/callback/google?code=c&state=s', { profile })
        const load = vi.spyOn(event.locals, 'safeGetSession')

        expect(await redirectFrom(event)).toBeUndefined()
        expect(load).not.toHaveBeenCalled()
        expect(event.locals.claims).toBeUndefined()
      },
    )

    it('is left alone on the error page an OAuth failure lands on', async () => {
      expect(await redirectFrom(mockEvent('/auth/error?reason=failed'))).toBeUndefined()
    })
  })

  it('sends a signed-out visitor from /explore to a bare sign-in, where the installed app shows the welcome fork', async () => {
    expect(await redirectFrom(mockEvent('/explore', { signedIn: false }))).toBe(AUTH_PATH)
    const { load } = await import('../../routes/(landing)/auth/+page.server')
    let location: string | undefined
    try {
      load({} as never)
    } catch (thrown) {
      location = isRedirect(thrown) ? thrown.location : undefined
    }
    expect(location).toBe('/auth/signin')
  })

  it('sends a signed-out visitor from a deep link to sign-in, carrying the page as next', async () => {
    expect(await redirectFrom(mockEvent('/settings/sign-in-methods?tab=a', { signedIn: false }))).toBe(
      '/auth/signin?next=%2Fsettings%2Fsign-in-methods%3Ftab%3Da',
    )
  })

  describe('the public root', () => {
    it('lets a signed-out visitor read it', async () => {
      expect(await redirectFrom(mockEvent('/', { signedIn: false }))).toBeUndefined()
    })

    it("lets a signed-out visitor read the native app's iOS return", async () => {
      const code = 'a'.repeat(43)
      expect(await redirectFrom(mockEvent(`/app-return?code=${code}`, { signedIn: false }))).toBeUndefined()
    })

    it.each(['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json'])(
      "lets the platforms' anonymous fetchers read %s",
      async (path) => {
        expect(await redirectFrom(mockEvent(path, { signedIn: false }))).toBeUndefined()
      },
    )

    // Both roots, spelled out rather than read off the constant, since the constant is the thing
    // under test: the signup mail sends a confirmed account to '/', so losing this strands it.
    it.each(['/', '/explore'])('bounces a regionless member off %s to the create screen', async (path) => {
      expect(await redirectFrom(mockEvent(path, { regions: 0 }))).toBe(REGION_CREATE_PATH)
    })

    it('still interrupts it for a live invitation, which is waiting for that person', async () => {
      lookup.mockResolvedValue({ token: 'abc' } as Awaited<ReturnType<typeof findLiveInvitationByEmail>>)

      expect(await redirectFrom(mockEvent('/', { regions: 0 }))).toBe(acceptPath('abc'))
    })
  })
  describe('a signed-in account with no profile', () => {
    const noProfile = { profile: false }

    it('is sent from an app screen to the profile step, keeping where it was headed', async () => {
      expect(await redirectFrom(mockEvent('/explore?tab=map', noProfile))).toBe(
        '/auth/profile?next=%2Fexplore%3Ftab%3Dmap',
      )
    })

    it.each(['/auth/profile', '/legal/privacy', '/auth/confirm', '/app-return?code=x'])('may open %s', async (path) => {
      expect(await redirectFrom(mockEvent(path, noProfile))).toBeUndefined()
    })

    it('is signed out to the sign-in page when an account deletion left a marker', async () => {
      marked.mockResolvedValue(true)
      expect(await redirectFrom(mockEvent('/explore', noProfile))).toBe('/auth/signin?deleted=1')
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('is neither bounced nor gated on a remote call made from an auth page', async () => {
      expect(await redirectFrom(mockEvent('/auth/forgot-password', { ...noProfile, remote: true }))).toBeUndefined()
    })

    it('is gated when it opens that same auth page', async () => {
      expect(await redirectFrom(mockEvent('/auth/forgot-password', noProfile))).toBe(
        '/auth/profile?next=%2Fauth%2Fforgot-password',
      )
    })

    it('reaches the profile step before a pending invitation, which it keeps as next', async () => {
      lookup.mockResolvedValue({ token: 'abc' } as Awaited<ReturnType<typeof findLiveInvitationByEmail>>)
      expect(await redirectFrom(mockEvent('/explore', { ...noProfile, regions: 0 }))).toBe(
        '/auth/profile?next=%2Fexplore',
      )
    })
  })

  it('puts the verified token on locals, and none for a signed-out visitor', async () => {
    const signedIn = mockEvent('/explore')
    const signedOut = mockEvent('/', { signedIn: false })
    await redirectFrom(signedIn)
    await redirectFrom(signedOut)

    expect(signedIn.locals.verifiedToken).toEqual({ accessToken: 'a.cookie.token' })
    expect(signedOut.locals.verifiedToken).toBeUndefined()
  })

  it('sends an account that has a profile on from the profile step', async () => {
    expect(await redirectFrom(mockEvent('/auth/profile?next=%2Finvite%2Faccept%2Fabc'))).toBe(
      '/auth/continue?next=%2Finvite%2Faccept%2Fabc',
    )
  })
})

/** The app API through the real `crossSiteGuard`, `supabase` and `authGuard`, in the app's order. */
describe('the app API prefix', async () => {
  const { crossSiteGuard } = await import('$lib/hooks/crossSite.server')
  // `sequence`, by hand: Kit's needs a request store with tracing, which a test has not got.
  const handle: Handle = ({ event, resolve }) =>
    crossSiteGuard({
      event,
      resolve: (one) => supabase({ event: one, resolve: (two) => authGuard({ event: two, resolve }) }),
    })
  const WEB_COOKIE = 'sb-grnyte-auth-token=web'
  const claimsOf = (token: string) => ({ session_id: `session-${token}`, sub: `user-${token}` })

  beforeEach(() => {
    vi.mocked(createServerClient).mockClear()
    live.sessions = new Set(['session-bearer', 'session-cookie'])
    // A valid web cookie session, and a valid Bearer, each verifying as its own caller.
    getSession.mockResolvedValue({ data: { session: { access_token: 'cookie' } }, error: null })
    verify.mockImplementation(async (token) =>
      token === 'cookie' || token === 'bearer'
        ? ({ claims: claimsOf(token), ok: true, token: { accessToken: token, claims: claimsOf(token) } } as never)
        : token === 'expired'
          ? { ok: false, reason: 'expired' }
          : { ok: false, reason: token == null ? 'absent' : 'invalid' },
    )
  })

  /** Runs the handle; answers the response and the locals the endpoint saw (undefined if it never ran). */
  async function serve(
    path: string,
    { bearer, method = 'GET', remoteFrom, site }: Partial<Record<string, string>> = {},
    answer = () => new Response('OK'),
  ) {
    const headers = new Headers({ 'content-type': 'application/json', cookie: WEB_COOKIE })
    if (bearer != null) headers.set('authorization', `Bearer ${bearer}`)
    if (site != null) headers.set('sec-fetch-site', site)
    const request = new Request(`https://grnyte.rocks${remoteFrom == null ? path : '/_app/remote/fn'}`, {
      body: method === 'GET' ? undefined : '{}',
      headers,
      method,
    })
    const event = {
      cookies: { getAll: () => [{ name: 'sb-grnyte-auth-token', value: 'web' }], set: vi.fn() },
      getClientAddress: () => '198.51.100.7',
      isRemoteRequest: remoteFrom != null,
      locals: {},
      request,
      setHeaders: vi.fn(),
      url: new URL(`https://grnyte.rocks${path}`),
    } as unknown as RequestEvent
    let seen: App.Locals | undefined
    const response = await Promise.resolve(
      handle({
        event,
        resolve: async (resolved) => {
          seen = resolved.locals
          return answer()
        },
      }),
    ).catch((thrown: unknown) => (isRedirect(thrown) ? new Response(null, { status: 303 }) : Promise.reject(thrown)))
    return { response, seen }
  }

  it('reads no web cookie session on the prefix, only the Bearer', async () => {
    expect((await serve('/api/app/v1/profile')).seen?.claims).toBeUndefined()
    expect(createServerClient).not.toHaveBeenCalled()
    expect((await serve('/api/app/v1/profile', { bearer: 'bearer' })).seen?.claims).toEqual(claimsOf('bearer'))
  })

  it('counts a Bearer nowhere else', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    expect((await serve('/settings', { bearer: 'bearer' })).response.status).toBe(303)
  })

  it('does not take a remote call that claims the prefix for the prefix', async () => {
    const { seen } = await serve('/api/app/v1/profile', { bearer: 'bearer', method: 'POST', remoteFrom: 'page' })
    expect(seen?.claims).toEqual(claimsOf('cookie'))
  })

  it('is anonymous for a Bearer whose session row is gone, and for an expired one, with no refresh', async () => {
    live.sessions.delete('session-bearer')
    expect((await serve('/api/app/v1/profile', { bearer: 'bearer' })).seen?.claims).toBeUndefined()
    expect((await serve('/api/app/v1/profile', { bearer: 'expired' })).seen?.claims).toBeUndefined()
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('hands the Bearer caller verified token on, for supabaseAuthServerAs and dispatchIntent', async () => {
    const { seen } = await serve('/api/app/v1/email/change', { bearer: 'bearer', method: 'POST' })
    expect(seen?.verifiedToken).toEqual({ accessToken: 'bearer', claims: claimsOf('bearer') })
  })

  it('lets a cross-site JSON POST with a web cookie through, served only as its Bearer caller', async () => {
    const anonymousCall = await serve('/api/app/v1/profile', { method: 'POST', site: 'cross-site' })
    expect(anonymousCall.response.status).toBe(200)
    expect(anonymousCall.seen?.claims).toBeUndefined()
    const bearerCall = await serve('/api/app/v1/profile', { bearer: 'bearer', method: 'POST', site: 'cross-site' })
    expect(bearerCall.seen?.claims).toEqual(claimsOf('bearer'))
  })

  it("answers Kit's own 404 and 405 in the v1 error shape, uncached, and an endpoint's own refusal as it is", async () => {
    // Kit's answers: its error page (JSON when the caller accepts it) and `method_not_allowed`.
    const kitHtml = () => new Response('<html></html>', { headers: { 'content-type': 'text/html' }, status: 404 })
    const kitJson = () => Response.json({ message: 'Not Found' }, { status: 404 })
    const kit405 = () =>
      new Response('POST method not allowed', { headers: { allow: 'GET', 'content-type': 'text/plain' }, status: 405 })
    const answered = async (path: string, method: string, answer: () => Response) => {
      const { response } = await serve(path, { method }, answer)
      const { headers, status } = response
      return { allow: headers.get('allow'), body: await response.json(), cache: headers.get('cache-control'), status }
    }
    const notFound = { allow: null, body: { error: { code: 'not_found' } }, cache: 'no-store', status: 404 }
    const notAllowed = { allow: 'GET', body: { error: { code: 'method_not_allowed' } }, cache: 'no-store', status: 405 }

    expect(await answered('/api/app/v1/nope', 'GET', kitHtml)).toEqual(notFound)
    expect(await answered('/api/app/v1/nope', 'GET', kitJson)).toEqual(notFound)
    expect(await answered('/api/app/v1/challenge', 'POST', kit405)).toEqual(notAllowed)
    // OPTIONS stays a 405 with no CORS headers (design.md section 1).
    const { response: options } = await serve('/api/app/v1/challenge', { method: 'OPTIONS' }, kit405)
    expect(options.status).toBe(405)
    expect([...options.headers.keys()].filter((name) => name.startsWith('access-control-'))).toEqual([])
    const own = await answered('/api/app/v1/thing', 'GET', () => appError(404, { code: 'own_code' }))
    expect(own).toEqual({ ...notFound, body: { error: { code: 'own_code' } } })
  })
})
