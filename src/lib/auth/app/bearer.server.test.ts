/** The app API's session source, with the verifier, the liveness read and the page state stubbed. */
import type { VerifiedToken } from '$lib/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('$lib/db/db.server', () => ({ db: {} }))
vi.mock('$lib/auth/verify.server', async (actual) => ({ ...(await actual()), verifyAccessToken: vi.fn() }))
vi.mock('$lib/auth/session.server', () => ({ isSessionLive: vi.fn() }))

const { verifyAccessToken } = await import('$lib/auth/verify.server')
const { isSessionLive } = await import('$lib/auth/session.server')
const getPageState = vi.fn()
const { bearerSession } = await import('./bearer.server')

const claims = { session_id: 'session-1', sub: 'user-1' }
const token = { accessToken: 'token', claims } as unknown as VerifiedToken
const request = new Request('https://grnyte.example/api/app/v1/profile', { headers: { authorization: 'Bearer token' } })

beforeEach(() => {
  vi.mocked(verifyAccessToken).mockResolvedValue({ claims, ok: true, token } as never)
  vi.mocked(isSessionLive).mockResolvedValue(true)
  getPageState.mockResolvedValue({ user: undefined, userRegions: [] } as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('bearerSession', () => {
  it('gives the claims and the token of a verified, live session', async () => {
    expect(await bearerSession(request, getPageState)).toMatchObject({
      backendUnavailable: false,
      claims,
      verifiedToken: token,
    })
    expect(verifyAccessToken).toHaveBeenCalledWith('token')
  })

  it('is anonymous for a dead session', async () => {
    vi.mocked(isSessionLive).mockResolvedValue(false)
    expect(await bearerSession(request, getPageState)).toMatchObject({ backendUnavailable: false, claims: undefined })
  })

  it.each([
    ['a JWKS outage', () => vi.mocked(verifyAccessToken).mockResolvedValue({ ok: false, reason: 'unavailable' })],
    ['a thrown session read', () => vi.mocked(isSessionLive).mockRejectedValue(new Error('down'))],
    ['a failed page state', () => getPageState.mockRejectedValue(new Error('down'))],
  ])('answers backendUnavailable with no claims on %s', async (_name, fail) => {
    fail()
    const session = await bearerSession(request, getPageState)
    expect(session).toMatchObject({ backendUnavailable: true, claims: undefined })
    expect(session.verifiedToken).toBeUndefined()
  })
})
