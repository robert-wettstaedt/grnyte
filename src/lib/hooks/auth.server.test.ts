import { APP_HOME_PATH, AUTH_PATH } from '$lib/auth'
import { acceptPath, REGION_CREATE_PATH } from '$lib/entities/region/paths'
import { isRedirect, type RequestEvent } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The module connects to Postgres at import time, and nothing here reaches a query: every session
// this suite drives is stubbed, and the one DB call `authGuard` can make is the invitation lookup
// below.
vi.mock('$lib/db/db.server', () => ({ db: {} }))
vi.mock('$lib/entities/region/invite.server', () => ({ findLiveInvitationByEmail: vi.fn() }))
vi.mock('$lib/auth/verify.server', () => ({ verifyAccessToken: vi.fn() }))
vi.mock('$lib/entities/user/provision.server', () => ({ hasDeletionMarker: vi.fn() }))
const getSession = vi.fn()
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ auth: { getSession } })) }))

const { findLiveInvitationByEmail } = await import('$lib/entities/region/invite.server')
const { verifyAccessToken } = await import('$lib/auth/verify.server')
const { hasDeletionMarker } = await import('$lib/entities/user/provision.server')
const { createServerClient } = await import('@supabase/ssr')
const { authGuard, supabase } = await import('$lib/hooks/auth.server')

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
    const event = { locals: {}, url: new URL(`https://grnyte.rocks${path}`) } as unknown as RequestEvent
    await supabase({ event, resolve: () => Promise.resolve(new Response('OK')) })
    return vi.mocked(createServerClient).mock.calls.length
  }

  // Building one starts a session load whose late cookie write crashed the server on an expired cookie.
  it('builds no client for a zero-cache callback', async () => {
    expect(await clientsBuiltFor('/api/zero/get-queries')).toBe(0)
    expect(await clientsBuiltFor('/explore')).toBe(1)
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

  it('leaves the app API blind to the session cookie', async () => {
    const event = mockEvent('/api/app/session')
    expect(await redirectFrom(event)).toBeUndefined()
    expect(event.locals.claims).toBeUndefined()
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
      expect(await redirectFrom(mockEvent('/auth/signin?next=%2Finvite%2Faccept%2Fabc'))).toBe('/invite/accept/abc')
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

  describe('the public root', () => {
    it('lets a signed-out visitor read it', async () => {
      expect(await redirectFrom(mockEvent('/', { signedIn: false }))).toBeUndefined()
    })

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

    it.each(['/auth/profile', '/legal/privacy', '/auth/confirm'])('may open %s', async (path) => {
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
    expect(await redirectFrom(mockEvent('/auth/profile?next=%2Finvite%2Faccept%2Fabc'))).toBe('/invite/accept/abc')
  })
})
