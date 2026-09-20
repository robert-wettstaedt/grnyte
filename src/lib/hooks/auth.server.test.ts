import { APP_HOME_PATH } from '$lib/auth'
import { acceptPath, REGION_CREATE_PATH } from '$lib/entities/region/dto'
import { isRedirect, type RequestEvent } from '@sveltejs/kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The module connects to Postgres at import time, and nothing here reaches a query: every session
// this suite drives is stubbed, and the one DB call `authGuard` can make is the invitation lookup
// below.
vi.mock('$lib/db/db.server', () => ({ db: {} }))
vi.mock('$lib/entities/region/invite.server', () => ({ findLiveInvitationByEmail: vi.fn() }))

const { findLiveInvitationByEmail } = await import('$lib/entities/region/invite.server')
const { authGuard } = await import('$lib/hooks/auth.server')

const lookup = vi.mocked(findLiveInvitationByEmail)

interface Session {
  email?: string
  regions?: number
  signedIn?: boolean
}

const mockEvent = (path: string, { email = 'climber@grnyte.rocks', regions = 1, signedIn = true }: Session = {}) => {
  const session = {
    backendUnavailable: false,
    claims: signedIn ? { email, sub: 'auth-user-1' } : undefined,
    user: undefined,
    userPermissions: undefined,
    userRegions: Array.from({ length: regions }, (_unused, index) => ({ regionFk: index + 1 })),
    userRole: undefined,
  }

  return {
    locals: { safeGetSession: () => Promise.resolve(session) },
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

describe('authGuard', () => {
  beforeEach(() => {
    lookup.mockReset()
    lookup.mockResolvedValue(undefined)
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
})
