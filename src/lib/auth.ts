import { jwtDecode, type JwtPayload } from 'jwt-decode'

export const APP_PERMISSION_REGIONS_ADMIN = 'regions.admin'
export const APP_PERMISSION_TAGS_ADMIN = 'tags.admin'
export const APP_PERMISSION_USERS_ADMIN = 'users.admin'

export const REGION_PERMISSION_DATA_DELETE = 'data.delete'
export const REGION_PERMISSION_DATA_EDIT = 'data.edit'
export const REGION_PERMISSION_DATA_READ = 'data.read'
export const REGION_PERMISSION_ADMIN = 'region.admin'

/**
 * @deprecated This permission is not used anymore.
 */
export const REGION_PERMISSION_DATA_EXPORT = 'data.export'

export type AppPermission =
  | typeof APP_PERMISSION_REGIONS_ADMIN
  | typeof APP_PERMISSION_TAGS_ADMIN
  | typeof APP_PERMISSION_USERS_ADMIN

export function checkAppPermission(
  userPermissions: App.Locals['userPermissions'],
  requiredPermissions: AppPermission[],
): boolean {
  return requiredPermissions.some((permission) => userPermissions?.includes(permission))
}

export type RegionPermission =
  | typeof REGION_PERMISSION_DATA_READ
  | typeof REGION_PERMISSION_DATA_EDIT
  | typeof REGION_PERMISSION_DATA_DELETE
  | typeof REGION_PERMISSION_ADMIN
  | typeof REGION_PERMISSION_DATA_EXPORT

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
