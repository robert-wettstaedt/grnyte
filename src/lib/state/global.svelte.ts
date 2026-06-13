import { page } from '$app/state'
import type { Grade } from '$lib/entities/grade/dto'
import { gradeList } from '$lib/entities/grade/resources.svelte'
import type { RegionMembership, UserRegion } from '$lib/entities/region/dto'
import { userRegionList } from '$lib/entities/region/resources.svelte'
import type { AppRole, Permission, RolePermission } from '$lib/entities/rolePermission/dto'
import { rolePermissionList } from '$lib/entities/rolePermission/resources.svelte'
import type { Tag } from '$lib/entities/tag/dto'
import { tagList } from '$lib/entities/tag/resources.svelte'
import type { GradingScale, User } from '$lib/entities/user/dto'
import { currentUser, currentUserRole } from '$lib/entities/user/resources.svelte'
import type { QueryResource } from '$lib/zero/resource.svelte'
import { getContext, setContext } from 'svelte'

const GLOBAL_STATE_KEY = Symbol('global-state')

/**
 * App-wide reference data and the signed-in user, loaded once from Zero and
 * shared through Svelte context. The underlying queries are eagerly preloaded
 * in `initZero`, so reads here render from the local store immediately.
 */
export interface GlobalState {
  /** All grades, ordered by their ordinal id (low → high). */
  readonly grades: Grade[]
  /** All available route tags, ordered by id. */
  readonly tags: Tag[]
  /** The signed-in user with their settings, or `undefined` while loading. */
  readonly user: User | undefined
  /** The user's preferred grading scale; defaults to `FB` until settings load. */
  readonly gradingScale: GradingScale
  /** The user's app/region role, or `undefined` if they have none. */
  readonly userRole: AppRole | undefined
  /** Permissions granted by the user's role, or `undefined` if they have no role. */
  readonly userPermissions: Permission[] | undefined
  /** The user's active region memberships, each with the permissions its role grants. */
  readonly userRegions: UserRegion[]
  /** True while app-shell prerequisites are still loading. */
  readonly isLoading: boolean

  /** Raw resources, for loading/empty/error states. */
  readonly gradesResource: QueryResource<Grade[]>
  readonly tagsResource: QueryResource<Tag[]>
  readonly userResource: QueryResource<User | undefined>
  readonly userRoleResource: QueryResource<AppRole | undefined>
  readonly rolePermissionsResource: QueryResource<RolePermission[]>
  readonly userRegionsResource: QueryResource<RegionMembership[]>
}

/**
 * Instantiates the global resources and publishes them on context. Call once,
 * during init of the authenticated `(app)` layout. Resources read `getZ()`
 * reactively, so they re-target automatically when the Zero client swaps.
 */
export function setGlobalState(): GlobalState | undefined {
  if (page.data.session?.user == null) {
    return
  }

  const gradesResource = gradeList()
  const tagsResource = tagList()
  const userResource = currentUser()
  const userRoleResource = currentUserRole()
  const rolePermissionsResource = rolePermissionList()
  const userRegionsResource = userRegionList()

  const state: GlobalState = {
    get grades() {
      return gradesResource.data
    },
    get tags() {
      return tagsResource.data
    },
    get user() {
      return userResource.data
    },
    get gradingScale() {
      return userResource.data?.userSettings?.gradingScale ?? 'FB'
    },
    get userRole() {
      return userRoleResource.data
    },
    get userPermissions() {
      const role = userRoleResource.data
      if (role == null) {
        return undefined
      }

      return rolePermissionsResource.data
        .filter((rolePermission) => rolePermission.role === role)
        .map((rolePermission) => rolePermission.permission)
    },
    get userRegions() {
      const rolePermissions = rolePermissionsResource.data

      return userRegionsResource.data.map((membership) => ({
        ...membership,
        permissions: rolePermissions
          .filter((rolePermission) => rolePermission.role === membership.role)
          .map((rolePermission) => rolePermission.permission),
      }))
    },
    get isLoading() {
      return (
        gradesResource.status === 'loading' ||
        tagsResource.status === 'loading' ||
        userResource.status === 'loading' ||
        userRoleResource.status === 'loading' ||
        rolePermissionsResource.status === 'loading' ||
        userRegionsResource.status === 'loading'
      )
    },
    get gradesResource() {
      return gradesResource
    },
    get tagsResource() {
      return tagsResource
    },
    get userResource() {
      return userResource
    },
    get userRoleResource() {
      return userRoleResource
    },
    get rolePermissionsResource() {
      return rolePermissionsResource
    },
    get userRegionsResource() {
      return userRegionsResource
    },
  }

  setContext(GLOBAL_STATE_KEY, state)
  return state
}

/** Reads the global state published by {@link setGlobalState}. */
export function getGlobalState(): GlobalState {
  const state = getContext<GlobalState | undefined>(GLOBAL_STATE_KEY)
  if (state == null) {
    throw new Error('Global state is not available — setGlobalState() must run in the (app) layout first')
  }
  return state
}
