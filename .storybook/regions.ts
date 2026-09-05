import {
  REGION_PERMISSION_ADMIN,
  REGION_PERMISSION_DELETE,
  REGION_PERMISSION_EDIT,
  REGION_PERMISSION_READ,
} from '../src/lib/auth'
import type { UserRegion } from '../src/lib/entities/region/dto'
import type { User } from '../src/lib/entities/user/dto'

/** The three permission tiers, as `parameters.globalState` fixtures. Region 1 throughout, so a
 *  story's entity only needs `regionFk: 1` to be governed by these. */
const region = (permissions: UserRegion['permissions'], role: UserRegion['role']): UserRegion[] => [
  { name: 'Fontainebleau', permissions, regionFk: 1, role, settings: undefined },
]

export const MEMBER = region([REGION_PERMISSION_READ], 'region_user')

export const MAINTAINER = region([REGION_PERMISSION_READ, REGION_PERMISSION_EDIT], 'region_maintainer')

export const ADMIN = region(
  [REGION_PERMISSION_READ, REGION_PERMISSION_EDIT, REGION_PERMISSION_DELETE, REGION_PERMISSION_ADMIN],
  'region_admin',
)

/** The signed-in user the delete predicates compare `createdBy` against. */
export const USER: User = { id: 1, username: 'chalky', userSettings: undefined }
