import type { AppRole, Permission } from '$lib/entities/rolePermission/dto'
import type { RegionSettings } from '$lib/forms/schemas'

/** An active region membership of the signed-in user, before permissions are resolved. */
export interface RegionMembership {
  regionFk: number
  role: AppRole
  name: string
  settings: RegionSettings | undefined
}

/** A region membership enriched with the permissions its role grants. */
export interface UserRegion extends RegionMembership {
  permissions: Permission[]
}
