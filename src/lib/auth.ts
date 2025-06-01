import { jwtDecode, type JwtPayload } from 'jwt-decode'
import { authLogger } from './logging'

export const APP_PERMISSION_ADMIN = 'app.admin'

export const REGION_PERMISSION_DELETE = 'region.delete'
export const REGION_PERMISSION_EDIT = 'region.edit'
export const REGION_PERMISSION_READ = 'region.read'
export const REGION_PERMISSION_ADMIN = 'region.admin'

export type AppPermission = typeof APP_PERMISSION_ADMIN

export function checkAppPermission(
  userPermissions: App.Locals['userPermissions'],
  requiredPermissions: AppPermission[],
): boolean {
  const hasPermission = requiredPermissions.some((permission) => userPermissions?.includes(permission))

  authLogger.debug('App permission check', {
    userPermissions,
    requiredPermissions,
    granted: hasPermission,
  })

  return hasPermission
}

export type RegionPermission =
  | typeof REGION_PERMISSION_READ
  | typeof REGION_PERMISSION_EDIT
  | typeof REGION_PERMISSION_DELETE
  | typeof REGION_PERMISSION_ADMIN

export function checkRegionPermission(
  userRegions: App.Locals['userRegions'],
  requiredPermissions: RegionPermission[],
  regionId: number | undefined | null,
): boolean {
  const hasPermission = requiredPermissions.some((permission) =>
    userRegions.some((region) => region.regionFk === regionId && region.permissions.includes(permission)),
  )

  authLogger.debug('Region permission check', {
    userRegions: userRegions.map((r) => ({ regionFk: r.regionFk, permissions: r.permissions })),
    requiredPermissions,
    regionId,
    granted: hasPermission,
  })

  return hasPermission
}

export interface SupabaseToken extends JwtPayload {
  iss?: string
  sub?: string
  aud?: string[] | string
  exp?: number
  nbf?: number
  iat?: number
  jti?: string
  role?: string
}

export function decodeToken(accessToken: string): SupabaseToken {
  try {
    const decoded = jwtDecode<SupabaseToken>(accessToken)
    authLogger.debug('Token decoded successfully', {
      sub: decoded.sub,
      role: decoded.role,
      exp: decoded.exp,
    })
    return decoded
  } catch (error) {
    authLogger.warn('Token decode failed, using anonymous role', { error })
    return { role: 'anon' } as SupabaseToken
  }
}
