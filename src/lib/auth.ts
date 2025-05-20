import { jwtDecode, type JwtPayload } from 'jwt-decode'

export const DELETE_PERMISSION = 'data.delete'
export const EDIT_PERMISSION = 'data.edit'
export const EXPORT_PERMISSION = 'data.export'
export const READ_PERMISSION = 'data.read'
export const REGION_ADMIN_PERMISSION = 'regions.admin'
export const TAG_ADMIN_PERMISSION = 'tags.admin'
export const USER_ADMIN_PERMISSION = 'users.admin'

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
