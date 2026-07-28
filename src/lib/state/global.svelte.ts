import { page } from '$app/state'
import type { Grade } from '$lib/entities/grade/dto'
import { gradeList } from '$lib/entities/grade/resources.svelte'
import type { RegionMembership, UserRegion } from '$lib/entities/region/dto'
import { userRegionList } from '$lib/entities/region/resources.svelte'
import type { AppRole, Permission, RolePermission } from '$lib/entities/rolePermission/dto'
import { rolePermissionList } from '$lib/entities/rolePermission/resources.svelte'
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
  /** Raw resources, for loading/empty/error states. */
  readonly gradesResource: QueryResource<Grade[]>
  /** The user's preferred grading scale; defaults to `FB` until settings load. */
  readonly gradingScale: GradingScale
  /** True while app-shell prerequisites are still loading. */
  readonly isLoading: boolean
  readonly rolePermissionsResource: QueryResource<RolePermission[]>
  /** The signed-in user with their settings, or `undefined` while loading. */
  readonly user: undefined | User

  /** Permissions granted by the user's role, or `undefined` if they have no role. */
  readonly userPermissions: Permission[] | undefined
  /** The user's active region memberships, each with the permissions its role grants. */
  readonly userRegions: UserRegion[]
  readonly userRegionsResource: QueryResource<RegionMembership[]>
  readonly userResource: QueryResource<undefined | User>
  /** The user's app/region role, or `undefined` if they have none. */
  readonly userRole: AppRole | undefined
  readonly userRoleResource: QueryResource<AppRole | undefined>
}

/** Reads the global state published by {@link setGlobalState}. */
export function getGlobalState(): GlobalState {
  const state = getContext<GlobalState | undefined>(GLOBAL_STATE_KEY)
  if (state == null) {
    throw new Error('Global state is not available — setGlobalState() must run in the (app) layout first')
  }
  return state
}

/**
 * Publishes an already-built state object on context. `setGlobalState` builds
 * the real one from Zero resources; Storybook's preview decorator and the
 * server-loaded `/f/<id>` share page inject a static fixture through here instead.
 */
export function provideGlobalState(state: GlobalState): GlobalState {
  setContext(GLOBAL_STATE_KEY, state)
  return state
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
  const userResource = currentUser()
  const userRoleResource = currentUserRole()
  const rolePermissionsResource = rolePermissionList()
  const userRegionsResource = userRegionList()

  const state: GlobalState = {
    get grades() {
      return gradesResource.data
    },
    get gradesResource() {
      return gradesResource
    },
    get gradingScale() {
      return userResource.data?.userSettings?.gradingScale ?? 'FB'
    },
    get isLoading() {
      return (
        gradesResource.status === 'loading' ||
        userResource.status === 'loading' ||
        userRoleResource.status === 'loading' ||
        rolePermissionsResource.status === 'loading' ||
        userRegionsResource.status === 'loading'
      )
    },
    get rolePermissionsResource() {
      return rolePermissionsResource
    },
    get user() {
      return userResource.data
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
    get userRegionsResource() {
      return userRegionsResource
    },
    get userResource() {
      return userResource
    },
    get userRole() {
      return userRoleResource.data
    },
    get userRoleResource() {
      return userRoleResource
    },
  }

  return provideGlobalState(state)
}

/**
 * A static, already-"ready" {@link GlobalState} for contexts without Zero: Storybook
 * fixtures and the standalone `/f/<id>` page (which loads its reference data over a
 * server load). Only the fields a caller needs must be passed; the rest default to empty.
 */
export function staticGlobalState(
  data: {
    grades?: Grade[]
    gradingScale?: GradingScale
    user?: User
    userPermissions?: Permission[]
    userRegions?: UserRegion[]
    userRole?: AppRole
  } = {},
): GlobalState {
  const ready = <T>(value: T): QueryResource<T> => ({
    data: value,
    isComplete: true,
    isEmpty: Array.isArray(value) ? value.length === 0 : value == null,
    isSyncing: false,
    status: 'ready',
  })

  const grades = data.grades ?? []
  const userRegions = data.userRegions ?? []

  return {
    grades,
    gradesResource: ready(grades),
    gradingScale: data.gradingScale ?? data.user?.userSettings?.gradingScale ?? 'FB',
    isLoading: false,
    rolePermissionsResource: ready([]),
    user: data.user,
    userPermissions: data.userPermissions,
    userRegions,
    userRegionsResource: ready(userRegions),
    userResource: ready(data.user),
    userRole: data.userRole,
    userRoleResource: ready(data.userRole),
  }
}
