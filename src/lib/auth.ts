import { jwtDecode, type JwtPayload } from 'jwt-decode'

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
  return requiredPermissions.some((permission) => userPermissions?.includes(permission))
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
  return requiredPermissions.some((permission) =>
    userRegions.some((region) => region.regionFk === regionId && region.permissions.includes(permission)),
  )
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
    return jwtDecode<SupabaseToken>(accessToken)
  } catch (error) {
    return { role: 'anon' } as SupabaseToken
  }
}
