import type { appRole } from '$lib/db/schema'
import type { UserRegion } from '$lib/entities/region/dto'
import { jwtDecode, type JwtPayload } from 'jwt-decode'

export const APP_PERMISSION_ADMIN = 'app.admin'

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

export interface SupabaseToken extends JwtPayload {
  aud?: string | string[]
  exp?: number
  iat?: number
  iss?: string
  jti?: string
  nbf?: number
  role?: string
  sub?: string
  user_role?: (typeof appRole.enumValues)[number]
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

export function decodeToken(accessToken: string): SupabaseToken {
  try {
    return jwtDecode<SupabaseToken>(accessToken)
  } catch {
    return { role: 'anon' } as SupabaseToken
  }
}
