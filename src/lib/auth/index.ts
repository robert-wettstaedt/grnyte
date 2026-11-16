import type { Pathname } from '$app/types'
import type { appRole } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'

export const APP_PERMISSION_ADMIN = 'app.admin'

/** Where "take me into the app" lands. In 1.0 that was `/`, which is now the landing page, so every
 *  caller reads this rather than spelling it out and drifting. */
export const APP_HOME_PATH = '/explore' satisfies Pathname

/** The auth subtree's root. Here rather than in `auth.server.ts` because
 *  {@link signedInRedirectTarget} has to recognise it too. */
export const AUTH_PATH = '/auth' satisfies Pathname

/** `app_metadata` key on an unconfirmed account signed up for twice; confirming it forces a new
 *  password, and no session counts while the key is still set. */
export const CONTESTED_SIGNUP = 'contested_signup'

/** `app_metadata` on every account grnyte creates; `before_user_created_hook` refuses an email
 *  sign-up without it, so GoTrue's public sign-up cannot skip grnyte's checks. */
export const SIGNUP_MARKER = { signup: 'grnyte' } as const

/** The one reading of {@link CONTESTED_SIGNUP}: any value counts, only a removed key clears it. */
export const isContested = (appMetadata: unknown): boolean =>
  (appMetadata as null | Record<string, unknown> | undefined)?.[CONTESTED_SIGNUP] != null

/** The ASVS ceiling for out-of-band codes. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000

/** Only a code just verified on this session writes a fresh `otp` entry (under 10 minutes). */
export function isFreshCodeSession(claims: Pick<SupabaseToken, 'amr'>, now = Date.now()): boolean {
  return (claims.amr ?? []).some((entry) => entry.method === 'otp' && now - entry.timestamp * 1000 < CODE_LIFETIME_MS)
}

/** Only there to give the parser something to resolve a relative path against, see
 *  {@link isSameOriginPath}. Never reachable, so a bug that let one through would 404 rather
 *  than land somewhere real. */
const REDIRECT_BASE = 'https://redirect.invalid'

/** C0 plus DEL. A Location header carrying any of these throws, and the URL parser hides them. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/

export const REGION_PERMISSION_DELETE = 'region.delete'
export const REGION_PERMISSION_EDIT = 'region.edit'
export const REGION_PERMISSION_READ = 'region.read'
export const REGION_PERMISSION_ADMIN = 'region.admin'

/** Actions behind a re-authentication. Targets: auth user id, auth user id, `regionFk`, `regionFk:userFk`. */
export const REAUTH_ACTIONS = [
  'account.delete',
  'identity.link',
  'identity.unlink',
  'password.change',
  'region.delete',
  'region.transfer',
] as const
/** The longest `target` a re-authentication step names; the remotes and the Apple start both hold to it. */
export const REAUTH_TARGET_MAX = 80
/** An `identity.*` code or start names a bare provider; only `bindLinkGrant` writes `<provider>:<sub>`. */
export const IDENTITY_TARGETS = ['apple', 'google'] as const
export type OAuthProvider = (typeof IDENTITY_TARGETS)[number]
export const PROVIDER_NAMES: Record<OAuthProvider, string> = { apple: 'Apple', google: 'Google' }
/** How a browser last signed in, for the "Last used" badge. */
export type LastMethod = 'email' | OAuthProvider

/** Apple is revoked before a deletion or Apple's own removal is confirmed. */
export const revokes = (action: ReauthAction, target: string): boolean =>
  action === 'account.delete' || (action === 'identity.unlink' && target === 'apple')
export type AppPermission = typeof APP_PERMISSION_ADMIN

export type ReauthAction = (typeof REAUTH_ACTIONS)[number]

export type RegionPermission =
  | typeof REGION_PERMISSION_ADMIN
  | typeof REGION_PERMISSION_DELETE
  | typeof REGION_PERMISSION_EDIT
  | typeof REGION_PERMISSION_READ

export interface SupabaseToken {
  /** How the session was made; a code verify writes an `otp` entry (timestamp in seconds). */
  amr?: { method: string; timestamp: number }[]
  aud?: string | string[]
  /** On every GoTrue access token. The invitation flow and the password re-check key on it, and it
   *  is NOT the same value as the forgeable `session.user.email` they used to read. */
  email?: string
  exp?: number
  iat?: number
  iss?: string
  jti?: string
  nbf?: number
  role?: string
  session_id?: string
  sub?: string
  user_role?: (typeof appRole.enumValues)[number]
}

/** Phantom. Nothing exists at runtime; only `verifyAccessToken` produces one. */
declare const verified: unique symbol

/**
 * An access token this server has verified against the project's signing key.
 *
 * The brand is what makes the fix stick. A plain object literal is not assignable here, so the
 * compiler refuses the exact mistake this type exists to prevent: handing reconstructed claims to
 * `createDrizzle`, whose only job is to tell Postgres who is asking.
 */
export type VerifiedClaims = SupabaseToken & { role: 'authenticated'; sub: string; readonly [verified]: true }

declare const verifiedToken: unique symbol

/** The access token `verifyAccessToken` checked, paired with its claims; only that function builds one. */
export type VerifiedToken = {
  readonly accessToken: string
  readonly claims: VerifiedClaims
  readonly [verifiedToken]: true
}

export function canDeleteCreatedRow(
  userRegions: UserRegion[],
  userId: number | undefined,
  row: { createdBy?: null | number; regionFk: number },
): boolean {
  return (
    checkRegionPermission(userRegions, [REGION_PERMISSION_DELETE], row.regionFk) ||
    (userId != null &&
      row.createdBy === userId &&
      checkRegionPermission(userRegions, [REGION_PERMISSION_EDIT], row.regionFk))
  )
}

export function checkRegionPermission(
  userRegions: UserRegion[],
  requiredPermissions: RegionPermission[],
  regionId: null | number | undefined,
): boolean {
  return requiredPermissions.some((permission) =>
    userRegions.some((region) => region.regionFk === regionId && region.permissions.includes(permission)),
  )
}

/**
 * `raw` as a path on this origin, reassembled from the parsed URL, or null.
 *
 * Control characters are refused before parsing, because the parser strips tabs and newlines, and
 * the origin is compared after it, because it reads `/\evil.com` as `https://evil.com/` the way a
 * browser reads the Location header. `new URL`, since the browser floor lacks the static parse method.
 */
export function sameOriginPath(raw: string): null | string {
  if (CONTROL_CHARACTERS.test(raw) || !raw.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(raw, REDIRECT_BASE)
  } catch {
    return null
  }
  // Dot segments can collapse to `//host` (`/..//evil.com`), which a Location reads as another origin.
  if (url.origin !== REDIRECT_BASE || url.pathname.startsWith('//')) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/** Whether `path` points at this origin, and so is safe to hand to `redirect()`. */
export const isSameOriginPath = (path: string): boolean => sameOriginPath(path) != null

/** Where an already-signed-in visitor to an auth page lands. `next` carries the invitation mail's
 *  destination; anything else falls back, including a target inside /auth. */
export function signedInRedirectTarget(next: null | string | undefined): string {
  return appPath(next) ?? APP_HOME_PATH
}

/** A same-origin path outside /auth, which the guard would bounce straight back. `startsWith`,
 *  loosely, because that is what the guard treats as the auth subtree. */
function appPath(raw: null | string | undefined): null | string {
  const path = raw == null ? null : sameOriginPath(raw)
  return path == null || path.startsWith(AUTH_PATH) ? null : path
}

const SIGN_IN_SCREENS: Record<string, 'signin' | 'signup'> = { '/auth/signin': 'signin', '/auth/signup': 'signup' }

/**
 * A link between the auth screens' steps, carrying `url`'s query (`next`, `email`) with `method=email`
 * set or dropped. A sign-in left with no query gets `form=signin`, so the installed app's fork never catches it.
 */
export function authStepHref(url: URL, path: '/auth/signin' | '/auth/signup', email: boolean): string {
  const query = new URLSearchParams(url.search)
  if (email) query.set('method', 'email')
  else query.delete('method')
  if (path === '/auth/signin' && query.toString() === '') query.set('form', 'signin')
  const search = query.toString()
  return search === '' ? path : `${path}?${search}`
}

/**
 * Where a provider sign-in cancels to and "Try again" leads, decided from one path and the intent,
 * at the start and again wherever it is read back. Client-safe: the error page runs it.
 */
export function oauthReturnTarget(path: null | string | undefined, intent: null | string | undefined): string {
  switch (intent) {
    case 'confirm':
      return appPath(path) ?? '/settings'
    case 'link':
      return '/settings/sign-in-methods'
    case 'signin': {
      const parsed = path == null ? null : sameOriginPath(path)
      const url = parsed == null ? null : new URL(parsed, REDIRECT_BASE)
      const screen = url == null ? undefined : SIGN_IN_SCREENS[url.pathname]
      // `form=`, so the installed app's welcome fork, shown only on a bare /auth/signin, never catches it.
      const params = new URLSearchParams({ form: screen ?? 'signin' })
      const next = appPath(url?.searchParams.get('next'))
      if (screen != null && next != null) params.set('next', next)
      return `/auth/${screen ?? 'signin'}?${params}`
    }
    default:
      return '/auth/signin?form=signin'
  }
}
