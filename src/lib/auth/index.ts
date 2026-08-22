import type { appRole } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'

export const APP_PERMISSION_ADMIN = 'app.admin'

/** Only there to give the parser something to resolve a relative path against, see
 *  {@link isSameOriginPath}. Never reachable, so a bug that let one through would 404 rather
 *  than land somewhere real. */
const REDIRECT_BASE = 'https://redirect.invalid'

export const REGION_PERMISSION_DELETE = 'region.delete'
export const REGION_PERMISSION_EDIT = 'region.edit'
export const REGION_PERMISSION_READ = 'region.read'
export const REGION_PERMISSION_ADMIN = 'region.admin'

export type AppPermission = typeof APP_PERMISSION_ADMIN

export type RegionPermission =
  | typeof REGION_PERMISSION_ADMIN
  | typeof REGION_PERMISSION_DELETE
  | typeof REGION_PERMISSION_EDIT
  | typeof REGION_PERMISSION_READ

export interface SupabaseToken {
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
 * Whether `path` points at this origin, and so is safe to hand to `redirect()`.
 *
 * The leading slash keeps it absolute; the URL parser is what makes that check honest, because it
 * reads the value exactly as a browser reads the Location header it ends up in: a backslash counts
 * as a slash, and tabs and newlines are stripped before parsing. `/\evil.com` and `/<tab>/evil.com`
 * both pass a string check and both resolve to `https://evil.com/` in every browser.
 */
export function isSameOriginPath(path: string): boolean {
  return path.startsWith('/') && URL.parse(path, REDIRECT_BASE)?.origin === REDIRECT_BASE
}
