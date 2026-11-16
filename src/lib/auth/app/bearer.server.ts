import { isSessionLive } from '$lib/auth/session.server'
import { parseBearer, verifyAccessToken } from '$lib/auth/verify.server'
import { db } from '$lib/db/db.server'

type BearerSession = Awaited<ReturnType<App.Locals['safeGetSession']>>

const anonymous = (backendUnavailable: boolean): BearerSession => ({
  backendUnavailable,
  claims: undefined,
  user: undefined,
  userPermissions: undefined,
  userRegions: [],
  userRole: undefined,
})

/**
 * The app API's caller: the Bearer token verified, never refreshed, and its session still live.
 * Anything else is anonymous; an outage is `backendUnavailable`, never a sign-out. `pageState` is
 * the hook's `getPageState`, passed in so this module does not import the hook back.
 */
export async function bearerSession(
  request: Request,
  pageState: (authUserId: string) => Promise<App.SafeSession>,
): Promise<BearerSession> {
  const verified = await verifyAccessToken(parseBearer(request))
  if (!verified.ok) return anonymous(verified.reason === 'unavailable')
  try {
    if (!(await isSessionLive(db, verified.claims))) return anonymous(false)
    return {
      ...(await pageState(verified.claims.sub)),
      backendUnavailable: false,
      claims: verified.claims,
      verifiedToken: verified.token,
    }
  } catch (cause) {
    console.error('[auth] app session read failed', cause)
    return anonymous(true)
  }
}
